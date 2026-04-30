use std::collections::VecDeque;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use byteorder::{LittleEndian, WriteBytesExt};
use serde_json::json;
use base64::{engine::general_purpose::STANDARD, Engine};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceType {
    Mic,
    Sys,
}

pub struct MixerMessage {
    pub source: SourceType,
    pub timestamp_ms: u64,
    pub samples: Vec<i16>,
}

pub struct AudioMixer {
    pub tx: mpsc::Sender<MixerMessage>,
}

impl AudioMixer {
    pub fn new(app: AppHandle, session_id: String, role: String) -> Self {
        let (tx, rx) = mpsc::channel(100);
        
        tauri::async_runtime::spawn(async move {
            run_mixer_loop(rx, app, session_id, role).await;
        });

        Self { tx }
    }

    pub fn send(&self, msg: MixerMessage) {
        let _ = self.tx.try_send(msg);
    }
}

async fn run_mixer_loop(mut rx: mpsc::Receiver<MixerMessage>, app: AppHandle, session_id: String, role: String) {
    let mut mic_buf: VecDeque<(u64, Vec<i16>)> = VecDeque::new();
    let mut sys_buf: VecDeque<(u64, Vec<i16>)> = VecDeque::new();

    let is_host = role == "host";

    while let Some(msg) = rx.recv().await {
        // Participants don't send PCM to the server
        if !is_host {
            continue;
        }

        match msg.source {
            SourceType::Mic => mic_buf.push_back((msg.timestamp_ms, msg.samples)),
            SourceType::Sys => sys_buf.push_back((msg.timestamp_ms, msg.samples)),
        }

        // If we are host but only one stream is producing (e.g. sys stream failed or not configured),
        // we shouldn't block forever. The jitter buffer resolves this by flushing if one side lags.
        
        while !mic_buf.is_empty() && !sys_buf.is_empty() {
            let (mic_ts, _) = mic_buf.front().unwrap();
            let (sys_ts, _) = sys_buf.front().unwrap();

            let diff = (*mic_ts as i64) - (*sys_ts as i64);
            
            let mixed_samples = if diff > 100 {
                // sys is much older, flush sys without mic
                let (ts, sys_samples) = sys_buf.pop_front().unwrap();
                Some((ts, sys_samples))
            } else if diff < -100 {
                // mic is much older, flush mic without sys
                let (ts, mic_samples) = mic_buf.pop_front().unwrap();
                Some((ts, mic_samples))
            } else {
                // close enough, mix them
                let (ts_mic, mic_samples) = mic_buf.pop_front().unwrap();
                let (_, sys_samples) = sys_buf.pop_front().unwrap();
                
                let mut mixed = Vec::with_capacity(mic_samples.len().max(sys_samples.len()));
                let len = mic_samples.len().min(sys_samples.len());
                for i in 0..len {
                    let m = mic_samples[i] as f32;
                    let s = sys_samples[i] as f32;
                    // attenuate slightly to prevent clipping
                    let mixed_val = (m + s) * 0.7;
                    let clamped = mixed_val.max(i16::MIN as f32).min(i16::MAX as f32) as i16;
                    mixed.push(clamped);
                }
                Some((ts_mic, mixed))
            };

            if let Some((ts, samples)) = mixed_samples {
                emit_audio_frame(&app, &session_id, ts, &samples);
            }
        }
        
        // Also flush if one buffer is too big (e.g. the other source stopped producing or hasn't started)
        while mic_buf.len() > 10 {
            let (ts, samples) = mic_buf.pop_front().unwrap();
            emit_audio_frame(&app, &session_id, ts, &samples);
        }
        while sys_buf.len() > 10 {
            let (ts, samples) = sys_buf.pop_front().unwrap();
            emit_audio_frame(&app, &session_id, ts, &samples);
        }
    }
}

fn emit_audio_frame(app: &AppHandle, session_id: &str, ts: u64, samples: &[i16]) {
    let mut pcm_bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        pcm_bytes.write_i16::<LittleEndian>(sample).unwrap();
    }
    
    let base64_data = STANDARD.encode(&pcm_bytes);
    let _ = app.emit("audio-frame", json!({
        "sessionId": session_id,
        "ts": ts,
        "data": base64_data,
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    // Since AppHandle requires a running Tauri app, we test the logic via a separate function or just trust the logic.
    // For now, testing the struct instantiation
    #[test]
    fn test_mixer_source_types() {
        assert_ne!(SourceType::Mic, SourceType::Sys);
    }
}

