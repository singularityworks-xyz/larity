use byteorder::{LittleEndian, WriteBytesExt};
use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::ipc::{Channel, Response};
use tokio::sync::Notify;

/// Must match `packages/stt/src/deepgram/dual-channel-session.ts` (`WS_AUDIO_TAG_MIC` / `WS_AUDIO_TAG_SYS`).
const WS_AUDIO_TAG_MIC: u8 = 0;
const WS_AUDIO_TAG_SYS: u8 = 1;

/// Frame layout: `[tag: u8][ts: u64 LE][linear16 LE samples…]`.
/// `sessionId` is intentionally absent — the client knows it. `ts` (first
/// audio frame) anchors `audio_stream_start` and per-frame metrics.
pub const FRAME_HEADER_LEN: usize = 1 + 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceType {
    Mic,
    Sys,
}

impl SourceType {
    fn wire_tag(self) -> u8 {
        match self {
            SourceType::Mic => WS_AUDIO_TAG_MIC,
            SourceType::Sys => WS_AUDIO_TAG_SYS,
        }
    }
}

pub struct MixerMessage {
    pub source: SourceType,
    pub timestamp_ms: u64,
    pub samples: Vec<i16>,
}

pub fn build_tagged_frame(tag: u8, timestamp_ms: u64, samples: &[i16]) -> Vec<u8> {
    let mut payload = Vec::with_capacity(FRAME_HEADER_LEN + samples.len() * 2);
    payload.push(tag);
    payload
        .write_u64::<LittleEndian>(timestamp_ms)
        .expect("Vec write cannot fail");
    for &sample in samples {
        payload
            .write_i16::<LittleEndian>(sample)
            .expect("Vec write cannot fail");
    }
    payload
}

pub struct AudioMixer {
    queue: BoundedMixerQueue,
}

/// Bounded mixer queue with drop-oldest backpressure (P4.3). Cloneable so
/// the Linux `parec` task can share the worker's queue.
///
/// A `VecDeque` + `Notify` (rather than `tokio::mpsc`) because drop-oldest
/// needs producer-side access to the head, which `mpsc::Sender` cannot pop.
/// The `std` mutex is held only for microsecond push/drain sections, never
/// across `.await`, and producers are a mix of sync (worker thread) and
/// async (loopback task) contexts.
#[derive(Clone)]
pub struct BoundedMixerQueue {
    shared: Arc<SharedQueue>,
}

struct SharedQueue {
    frames: Mutex<VecDeque<MixerMessage>>,
    notify: Notify,
    dropped: Arc<AtomicU64>,
    closed: AtomicBool,
}

pub const MIXER_CHANNEL_CAPACITY: usize = 16;

impl BoundedMixerQueue {
    fn new() -> Self {
        Self {
            shared: Arc::new(SharedQueue {
                frames: Mutex::new(VecDeque::with_capacity(MIXER_CHANNEL_CAPACITY)),
                notify: Notify::new(),
                dropped: Arc::new(AtomicU64::new(0)),
                closed: AtomicBool::new(false),
            }),
        }
    }

    pub fn send_drop_oldest(&self, msg: MixerMessage) {
        let mut frames = self.shared.frames.lock().expect("mixer queue lock");
        if frames.len() >= MIXER_CHANNEL_CAPACITY {
            frames.pop_front();
            self.shared.dropped.fetch_add(1, Ordering::Relaxed);
        }
        frames.push_back(msg);
        self.shared.notify.notify_one();
    }

    fn close(&self) {
        self.shared.closed.store(true, Ordering::Release);
        self.shared.notify.notify_one();
    }

    pub fn dropped_count(&self) -> u64 {
        self.shared.dropped.load(Ordering::Relaxed)
    }

    pub fn dropped_handle(&self) -> Arc<AtomicU64> {
        self.shared.dropped.clone()
    }

    pub fn is_closed(&self) -> bool {
        self.shared.closed.load(Ordering::Acquire)
    }

    #[cfg(test)]
    fn drain_for_test(&self) -> Vec<MixerMessage> {
        self.shared
            .frames
            .lock()
            .expect("mixer queue lock")
            .drain(..)
            .collect()
    }
}

impl AudioMixer {
    pub fn new(on_audio_frame: Channel<Response>) -> Self {
        let queue = BoundedMixerQueue::new();
        let shared = queue.shared.clone();

        tauri::async_runtime::spawn(async move {
            run_forward_loop(shared, on_audio_frame).await;
        });

        Self { queue }
    }

    pub fn send(&self, msg: MixerMessage) {
        self.queue.send_drop_oldest(msg);
    }

    pub fn queue(&self) -> BoundedMixerQueue {
        self.queue.clone()
    }

    pub fn dropped_count(&self) -> u64 {
        self.queue.dropped_count()
    }

    pub fn dropped_handle(&self) -> Arc<AtomicU64> {
        self.queue.dropped_handle()
    }
}

impl Drop for AudioMixer {
    fn drop(&mut self) {
        self.queue.close();
    }
}

async fn run_forward_loop(shared: Arc<SharedQueue>, on_audio_frame: Channel<Response>) {
    loop {
        let batch: Vec<MixerMessage> = shared
            .frames
            .lock()
            .expect("mixer queue lock")
            .drain(..)
            .collect();
        if batch.is_empty() {
            if shared.closed.load(Ordering::Acquire) {
                return;
            }
            shared.notify.notified().await;
            continue;
        }
        for msg in batch {
            let payload = build_tagged_frame(msg.source.wire_tag(), msg.timestamp_ms, &msg.samples);
            let _ = on_audio_frame.send(Response::new(payload));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_message(source: SourceType) -> MixerMessage {
        MixerMessage {
            source,
            timestamp_ms: 1,
            samples: vec![0; 8],
        }
    }

    #[test]
    fn source_types_distinct() {
        assert_ne!(SourceType::Mic, SourceType::Sys);
    }

    #[test]
    fn wire_tags_match_stt_constants() {
        assert_eq!(SourceType::Mic.wire_tag(), 0);
        assert_eq!(SourceType::Sys.wire_tag(), 1);
    }

    #[test]
    fn bounded_queue_drops_oldest_not_newest() {
        let queue = BoundedMixerQueue::new();
        for _ in 0..MIXER_CHANNEL_CAPACITY {
            queue.send_drop_oldest(test_message(SourceType::Mic));
        }
        queue.send_drop_oldest(MixerMessage {
            source: SourceType::Sys,
            timestamp_ms: 2,
            samples: vec![0; 8],
        });
        queue.send_drop_oldest(MixerMessage {
            source: SourceType::Sys,
            timestamp_ms: 3,
            samples: vec![0; 8],
        });
        assert_eq!(queue.dropped_count(), 2);
        let drained = queue.drain_for_test();
        assert_eq!(drained.len(), MIXER_CHANNEL_CAPACITY);
        assert_eq!(drained[0].source, SourceType::Mic);
        assert_eq!(drained[MIXER_CHANNEL_CAPACITY - 2].timestamp_ms, 2);
        assert_eq!(drained[MIXER_CHANNEL_CAPACITY - 1].timestamp_ms, 3);
    }

    #[test]
    fn bounded_queue_counts_every_shed_frame() {
        let queue = BoundedMixerQueue::new();
        queue.send_drop_oldest(test_message(SourceType::Mic));
        for _ in 0..(MIXER_CHANNEL_CAPACITY + 4) {
            queue.send_drop_oldest(test_message(SourceType::Sys));
        }
        assert_eq!(queue.dropped_count(), 5);
        let drained = queue.drain_for_test();
        assert_eq!(drained.len(), MIXER_CHANNEL_CAPACITY);
        assert_eq!(drained[MIXER_CHANNEL_CAPACITY - 1].source, SourceType::Sys);
    }

    #[test]
    fn tagged_frame_layout_round_trips() {
        let samples = [0i16, 1, -1, i16::MAX, i16::MIN];
        let frame = build_tagged_frame(WS_AUDIO_TAG_SYS, 0x0102030405060708, &samples);
        assert_eq!(frame.len(), FRAME_HEADER_LEN + samples.len() * 2);
        assert_eq!(frame[0], WS_AUDIO_TAG_SYS);
        assert_eq!(
            u64::from_le_bytes(frame[1..9].try_into().unwrap()),
            0x0102030405060708
        );
        let decoded: Vec<i16> = frame[9..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|[lo, hi]| i16::from_le_bytes([*lo, *hi]))
            .collect();
        assert_eq!(decoded, samples);
    }
}
