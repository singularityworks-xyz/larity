use base64::{engine::general_purpose::STANDARD, Engine};
use byteorder::{LittleEndian, WriteBytesExt};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;
/// First byte of each WebSocket binary frame (must match `@larity/stt` dual-channel session).
#[derive(Debug, Clone, Copy)]
#[repr(u8)]
pub enum AudioSourceTag {
    Mic = 0,
    Sys = 1,
}

pub struct TaggedPcmFrame {
    pub source: AudioSourceTag,
    pub timestamp_ms: u64,
    pub samples: Vec<i16>,
}

pub struct DualChannelRelay {
    tx: Arc<mpsc::UnboundedSender<TaggedPcmFrame>>,
}

impl DualChannelRelay {
    pub fn new(
        app: AppHandle,
        session_id: String,
        role: String,
        ws_url: String,
        user_id: String,
    ) -> Self {
        let (tx, rx) = mpsc::unbounded_channel::<TaggedPcmFrame>();
        let tx = Arc::new(tx);

        tauri::async_runtime::spawn(async move {
            run_relay_loop(rx, app, session_id, role, ws_url, user_id).await;
        });

        Self { tx }
    }

    pub fn send(&self, frame: TaggedPcmFrame) {
        let _ = self.tx.send(frame);
    }
}

async fn run_relay_loop(
    mut rx: mpsc::UnboundedReceiver<TaggedPcmFrame>,
    app: AppHandle,
    session_id: String,
    role: String,
    ws_url: String,
    user_id: String,
) {
    let is_host = role == "host";

    let mut ws_sender = None;
    if is_host {
        let mut url_str = ws_url.clone();
        if url_str.starts_with("http") {
            url_str = url_str.replace("http", "ws");
        }
        let ws_endpoint = format!("{}/api/v1/meeting/session/{}/audio", url_str, session_id);

        if let Ok(mut request) =
            tokio_tungstenite::tungstenite::client::IntoClientRequest::into_client_request(
                ws_endpoint.as_str(),
            )
        {
            let headers = request.headers_mut();
            headers.insert("x-user-id", user_id.parse().unwrap());
            headers.insert("x-client-role", role.parse().unwrap());

            if let Ok((ws_stream, _)) = connect_async(request).await {
                let (write, _read) = ws_stream.split();
                ws_sender = Some(write);
                println!("[Relay] Connected to WebSocket: {}", ws_endpoint);
            } else {
                eprintln!("[Relay] Failed to connect to WebSocket: {}", ws_endpoint);
            }
        }
    }

    while let Some(msg) = rx.recv().await {
        if !is_host {
            continue;
        }

        let tag = msg.source as u8;
        let mut pcm_bytes = Vec::with_capacity(1 + msg.samples.len() * 2);
        pcm_bytes.push(tag);
        for sample in &msg.samples {
            let _ = pcm_bytes.write_i16::<LittleEndian>(*sample);
        }

        send_frame(
            &mut ws_sender,
            &app,
            &session_id,
            msg.timestamp_ms,
            &pcm_bytes,
        )
        .await;
    }
}

async fn send_frame(
    ws_sender: &mut Option<impl SinkExt<WsMessage, Error = tokio_tungstenite::tungstenite::Error> + Unpin>,
    app: &AppHandle,
    session_id: &str,
    ts: u64,
    tagged_pcm: &[u8],
) {
    if let Some(ref mut sender) = ws_sender {
        if sender
            .send(WsMessage::Binary(tagged_pcm.to_vec().into()))
            .await
            .is_err()
        {
            eprintln!("[Relay] WebSocket send failed, frame dropped");
        }
    } else {
        emit_audio_frame(app, session_id, ts, tagged_pcm);
    }
}

fn emit_audio_frame(app: &AppHandle, session_id: &str, ts: u64, tagged_pcm: &[u8]) {
    let base64_data = STANDARD.encode(tagged_pcm);
    let _ = app.emit(
        "audio-frame",
        json!({
            "sessionId": session_id,
            "ts": ts,
            "data": base64_data,
        }),
    );
}
