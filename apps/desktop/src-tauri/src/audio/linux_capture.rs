use crate::audio::mixer::{BoundedMixerQueue, MixerMessage, SourceType};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncReadExt;
use tokio::process::Command;

pub fn start_linux_sys_capture(
    tx: BoundedMixerQueue,
) -> Result<tauri::async_runtime::JoinHandle<()>, String> {
    let child = match Command::new("parec")
        .args([
            "-d",
            "@DEFAULT_MONITOR@",
            "--format=s16le",
            "--rate=16000",
            "--channels=1",
            "--latency-msec=20",
            "--process-time-msec=10",
            "--raw",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(parec_err) => {
            // Fallback to pw-record on systems without parec.
            Command::new("pw-record")
                .args([
                    "--target",
                    "@DEFAULT_MONITOR@",
                    "--rate",
                    "16000",
                    "--channels",
                    "1",
                    "--format",
                    "s16",
                    "-",
                ])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .kill_on_drop(true)
                .spawn()
                .map_err(|pw_err| {
                    format!(
                        "Failed to start system audio capture (parec: {parec_err}; pw-record: {pw_err})"
                    )
                })?
        }
    };

    let mut child = child;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open loopback capture stdout".to_string())?;

    Ok(tauri::async_runtime::spawn(async move {
        // Hold the child so `kill_on_drop` keeps the recorder alive for the
        // lifetime of this task (and kills it when the task is aborted).
        let _child = child;

        let mut buffer = [0u8; 1024];

        loop {
            match stdout.read_exact(&mut buffer).await {
                Ok(_) => {
                    let ts = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64;

                    let mut samples = Vec::with_capacity(512);
                    for &[b0, b1] in buffer.as_chunks::<2>().0 {
                        let sample = i16::from_le_bytes([b0, b1]);
                        samples.push(sample);
                    }

                    if tx.is_closed() {
                        break;
                    }
                    tx.send_drop_oldest(MixerMessage {
                        source: SourceType::Sys,
                        timestamp_ms: ts,
                        samples,
                    });
                }
                Err(e) => {
                    eprintln!("parec stream read error or closed: {}", e);
                    break;
                }
            }
        }
    }))
}
