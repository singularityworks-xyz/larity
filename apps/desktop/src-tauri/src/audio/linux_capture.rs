use crate::audio::mixer::{MixerMessage, SourceType};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;

pub fn start_linux_sys_capture(
    tx: mpsc::UnboundedSender<MixerMessage>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        // Start `parec` targeting the default monitor
        // Using s16le, 16000 Hz, 1 channel (mono), raw PCM
        let mut child = match Command::new("parec")
            .args(&[
                "-d",
                "@DEFAULT_MONITOR@",
                "--format=s16le",
                "--rate=16000",
                "--channels=1",
                "--raw",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
        {
            Ok(child) => child,
            Err(e) => {
                eprintln!("Failed to start parec: {}", e);
                return;
            }
        };

        let mut stdout = child.stdout.take().expect("Failed to open pare stdout");

        // We want 50ms frames at 16kHz = 800 samples = 1600 bytes
        let mut buffer = [0u8; 1600];

        loop {
            match stdout.read_exact(&mut buffer).await {
                Ok(_) => {
                    let ts = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64;

                    // Convert bytes to i16
                    let mut samples = Vec::with_capacity(800);
                    for chunk in buffer.chunks_exact(2) {
                        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                        samples.push(sample);
                    }

                    if tx
                        .send(MixerMessage {
                            source: SourceType::Sys,
                            timestamp_ms: ts,
                            samples,
                        })
                        .is_err()
                    {
                        // Channel closed
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("parec stream read error or closed: {}", e);
                    break;
                }
            }
        }
    })
}
