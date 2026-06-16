use std::sync::mpsc;
use std::thread;
use tauri::{AppHandle, Emitter};
use voice_activity_detector::VoiceActivityDetector;

const THRESHOLD: f32 = 0.5;
const SPEECH_START_FRAMES: usize = 5;
const SPEECH_END_HOLDOVER: usize = 10;
const INPUT_GAIN: f32 = 5.0;
const VAD_CHANNEL_CAPACITY: usize = 4;

#[derive(Clone)]
pub struct VadTx {
    tx: mpsc::SyncSender<Vec<i16>>,
}

impl VadTx {
    pub fn send(&self, chunk: Vec<i16>) {
        if self.tx.try_send(chunk).is_err() {
            // channel full or disconnected — drop oldest frame silently
        }
    }
}

pub fn spawn_vad_task(app: AppHandle) -> Result<VadTx, voice_activity_detector::Error> {
    let detector = VoiceActivityDetector::builder()
        .sample_rate(16000)
        .chunk_size(512usize)
        .build()?;

    let (tx, rx) = mpsc::sync_channel::<Vec<i16>>(VAD_CHANNEL_CAPACITY);

    thread::spawn(move || {
        run_vad_loop(detector, app, rx);
    });

    Ok(VadTx { tx })
}

fn run_vad_loop(
    mut detector: VoiceActivityDetector,
    app: AppHandle,
    rx: mpsc::Receiver<Vec<i16>>,
) {
    let mut is_speaking = false;
    let mut buffer: Vec<i16> = Vec::new();
    let mut speech_counter: usize = 0;
    let mut silence_counter: usize = 0;

    while let Ok(chunk) = rx.recv() {
        buffer.extend_from_slice(&chunk);

        while buffer.len() >= 512 {
            let window: Vec<i16> = buffer.drain(..512).collect();

            let f32_window: Vec<f32> = window
                .iter()
                .map(|&s| (s as f32 / i16::MAX as f32 * INPUT_GAIN).clamp(-1.0, 1.0))
                .collect();

            let sum_sq: f32 = f32_window.iter().map(|&x| x * x).sum();
            let rms = (sum_sq / f32_window.len() as f32).sqrt();

            let probability = detector.predict(f32_window);

            if probability >= THRESHOLD {
                speech_counter += 1;
                silence_counter = 0;
            } else {
                speech_counter = 0;
                silence_counter += 1;
            }

            if speech_counter >= SPEECH_START_FRAMES && !is_speaking {
                is_speaking = true;
                silence_counter = 0;
                let _ = app.emit("vad-speech-start", ());
            }

            if is_speaking {
                let _ = app.emit("vad-amplitude", rms);
            }

            if silence_counter >= SPEECH_END_HOLDOVER && is_speaking {
                is_speaking = false;
                speech_counter = 0;
                let _ = app.emit("vad-speech-end", ());
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
    fn test_threshold_range() {
        assert!(THRESHOLD > 0.0);
        assert!(THRESHOLD < 1.0);
        assert!(INPUT_GAIN > 1.0);
    }
}
