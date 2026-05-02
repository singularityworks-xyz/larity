use base64::{engine::general_purpose::STANDARD, Engine};
use byteorder::{LittleEndian, WriteBytesExt};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

/// Must match `packages/stt/src/dual-channel-session.ts` (`WS_AUDIO_TAG_MIC` / `WS_AUDIO_TAG_SYS`).
const WS_AUDIO_TAG_MIC: u8 = 0;
const WS_AUDIO_TAG_SYS: u8 = 1;

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

/// Forwards mic and system **separately** as tagged mono frames (`[u8 tag][linear16 LE…]`).
/// Does **not** mix sources — the server opens one Deepgram connection per tag.
pub struct AudioMixer {
    pub tx: mpsc::UnboundedSender<MixerMessage>,
}

impl AudioMixer {
    pub fn new(app: AppHandle, session_id: String, role: String) -> Self {
        let (tx, rx) = mpsc::unbounded_channel::<MixerMessage>();

        tauri::async_runtime::spawn(async move {
            run_forward_loop(rx, app, session_id, role).await;
        });

        Self { tx }
    }

    pub fn send(&self, msg: MixerMessage) {
        let _ = self.tx.send(msg);
    }
}

async fn run_forward_loop(
    mut rx: mpsc::UnboundedReceiver<MixerMessage>,
    app: AppHandle,
    session_id: String,
    role: String,
) {
    let is_host = role == "host";

    while let Some(msg) = rx.recv().await {
        if !is_host {
            continue;
        }
        emit_tagged_audio_frame(
            &app,
            &session_id,
            msg.timestamp_ms,
            msg.source.wire_tag(),
            &msg.samples,
        );
    }
}

fn emit_tagged_audio_frame(app: &AppHandle, session_id: &str, ts: u64, tag: u8, samples: &[i16]) {
    let mut payload = Vec::with_capacity(1 + samples.len() * 2);
    payload.push(tag);
    for &sample in samples {
        payload.write_i16::<LittleEndian>(sample).unwrap();
    }

    let base64_data = STANDARD.encode(&payload);
    let _ = app.emit(
        "audio-frame",
        json!({
            "sessionId": session_id,
            "ts": ts,
            "data": base64_data,
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_types_distinct() {
        assert_ne!(SourceType::Mic, SourceType::Sys);
    }

    #[test]
    fn wire_tags_match_stt_constants() {
        assert_eq!(SourceType::Mic.wire_tag(), 0);
        assert_eq!(SourceType::Sys.wire_tag(), 1);
    }
}
