use crate::audio::amplitude::{AmplitudeListeners, should_emit_amplitude};
use crate::audio::engine::now_ms;
use std::sync::mpsc;
use std::thread;
use tauri::{AppHandle, Emitter};
use voice_activity_detector::VoiceActivityDetector;

const POSITIVE_THRESHOLD: f32 = 0.3;
const NEGATIVE_THRESHOLD: f32 = 0.15;
const SPEECH_START_FRAMES: usize = 3;
const SPEECH_END_HOLDOVER: usize = 10;
const INPUT_GAIN: f32 = 1.5;
const VAD_CHANNEL_CAPACITY: usize = 4;

#[derive(Clone)]
pub struct VadTx {
    tx: mpsc::SyncSender<Vec<i16>>,
}

impl VadTx {
    /// Enqueue one 512-sample frame without blocking. If the channel is
    /// full the newest frame is refused here — but the VAD loop collapses
    /// any backlog to the newest waiting frame before processing (see
    /// `run_vad_loop`), so the *effective* policy under load is
    /// drop-oldest: VAD correlation always works on the freshest speech
    /// rather than a stale backlog. (The old code claimed drop-oldest in a
    /// comment while `try_send` alone shed newest with no consumer shed.)
    pub fn send(&self, chunk: Vec<i16>) {
        let _ = self.tx.try_send(chunk);
    }
}

pub fn spawn_vad_task(
    app: AppHandle,
    amplitude: AmplitudeListeners,
) -> Result<VadTx, voice_activity_detector::Error> {
    let detector = VoiceActivityDetector::builder()
        .sample_rate(16000)
        .chunk_size(512usize)
        .build()?;

    let (tx, rx) = mpsc::sync_channel::<Vec<i16>>(VAD_CHANNEL_CAPACITY);

    thread::spawn(move || {
        run_vad_loop(detector, app, rx, amplitude);
    });

    Ok(VadTx { tx })
}

/// Collapse a just-received frame plus any waiting backlog to the newest
/// frame (P4.5). A 4-deep backlog is ~128 ms of stale audio; VAD onset
/// detection must run on fresh speech, not drain history.
fn collapse_backlog(rx: &mpsc::Receiver<Vec<i16>>, first: Vec<i16>) -> Vec<i16> {
    let mut newest = first;
    while let Ok(newer) = rx.try_recv() {
        newest = newer;
    }
    newest
}

fn run_vad_loop(
    mut detector: VoiceActivityDetector,
    app: AppHandle,
    rx: mpsc::Receiver<Vec<i16>>,
    amplitude: AmplitudeListeners,
) {
    let mut is_speaking = false;
    let mut buffer: Vec<i16> = Vec::new();
    let mut speech_counter: usize = 0;
    let mut silence_counter: usize = 0;
    let mut last_amp_emit_ms: u64 = 0;

    while let Ok(chunk) = rx.recv() {
        // P4.5 drop-oldest: collapse any waiting backlog to the newest
        // frame (see `collapse_backlog`). Under normal load the backlog is
        // empty and this is a no-op.
        buffer.extend_from_slice(&collapse_backlog(&rx, chunk));

        while buffer.len() >= 512 {
            let window: Vec<i16> = buffer.drain(..512).collect();

            let f32_window: Vec<f32> = window
                .iter()
                .map(|&s| (s as f32 / i16::MAX as f32 * INPUT_GAIN).clamp(-1.0, 1.0))
                .collect();

            let sum_sq: f32 = f32_window.iter().map(|&x| x * x).sum();
            let rms = (sum_sq / f32_window.len() as f32).sqrt();

            let probability = detector.predict(f32_window);

            if !is_speaking {
                if probability >= POSITIVE_THRESHOLD {
                    speech_counter += 1;
                } else {
                    speech_counter = 0;
                }

                if speech_counter >= SPEECH_START_FRAMES {
                    is_speaking = true;
                    silence_counter = 0;
                    speech_counter = 0;
                    let _ = app.emit("vad-speech-start", ());
                }
            } else {
                // P4.4: ≤15 Hz, main window only (VadManager), and only
                // while a listener is registered — not ~31 raw emits/sec.
                let now_ms = now_ms();
                if should_emit_amplitude(&amplitude, last_amp_emit_ms, now_ms) {
                    last_amp_emit_ms = now_ms;
                    let _ = app.emit_to(crate::audio::MAIN_WINDOW_LABEL, "vad-amplitude", rms);
                }

                if probability <= NEGATIVE_THRESHOLD {
                    silence_counter += 1;
                } else {
                    silence_counter = 0;
                }

                if silence_counter >= SPEECH_END_HOLDOVER {
                    is_speaking = false;
                    silence_counter = 0;
                    let _ = app.emit("vad-speech-end", ());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn test_spawn_and_shutdown() {
        let (_tx, rx) = mpsc::channel::<Vec<i16>>();
        drop(_tx);
        assert!(rx.recv().is_err());
    }

    #[test]
    fn vad_backlog_collapses_to_newest_frame() {
        let (tx, rx) = mpsc::sync_channel::<Vec<i16>>(VAD_CHANNEL_CAPACITY);
        for i in 0..VAD_CHANNEL_CAPACITY as i16 {
            tx.try_send(vec![i]).expect("queue frame");
        }
        // The loop's blocking recv takes the oldest; everything still
        // waiting collapses to the newest (drop-oldest, P4.5).
        let first = rx.recv().expect("first frame");
        assert_eq!(first, vec![0]);
        let newest = collapse_backlog(&rx, first);
        assert_eq!(newest, vec![VAD_CHANNEL_CAPACITY as i16 - 1]);
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn vad_backlog_empty_is_noop() {
        let (_tx, rx) = mpsc::sync_channel::<Vec<i16>>(VAD_CHANNEL_CAPACITY);
        let frame = vec![7i16];
        assert_eq!(collapse_backlog(&rx, frame.clone()), frame);
    }

    #[test]
    #[allow(clippy::assertions_on_constants)]
    fn test_threshold_range() {
        assert!(POSITIVE_THRESHOLD > 0.0);
        assert!(POSITIVE_THRESHOLD < 1.0);
        assert!(NEGATIVE_THRESHOLD < POSITIVE_THRESHOLD);
        assert!(INPUT_GAIN >= 1.0);
    }
}
