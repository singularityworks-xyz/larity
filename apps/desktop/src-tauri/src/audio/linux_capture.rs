use crate::audio::mixer::{BoundedMixerQueue, MixerMessage, SourceType};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncReadExt;
use tokio::process::Command;

/// Start Linux loopback (`parec`, falling back to `pw-record`).
///
/// Spawn is synchronous so a missing/failed recorder is reported to the
/// caller (and surfaced via `audio_capture_status`) instead of being
/// swallowed inside a detached task. The returned handle keeps the process
/// alive and owns the forwarding loop; aborting it (on drop) stops capture.
pub fn start_linux_sys_capture(
    tx: BoundedMixerQueue,
) -> Result<tauri::async_runtime::JoinHandle<()>, String> {
    // Start `parec` targeting the default monitor.
    // s16le, 16000 Hz, 1 channel (mono), raw PCM.
    // P4.7: request low server-side buffering so loopback stays fresh.
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

        // P4.7: 32 ms frames at 16 kHz = 512 samples = 1024 bytes, matching
        // the mixer's frame quantum (was 50 ms / 800 samples).
        let mut buffer = [0u8; 1024];

        loop {
            match stdout.read_exact(&mut buffer).await {
                Ok(_) => {
                    let ts = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64;

                    // Convert bytes to i16
                    let mut samples = Vec::with_capacity(512);
                    for &[b0, b1] in buffer.as_chunks::<2>().0 {
                        let sample = i16::from_le_bytes([b0, b1]);
                        samples.push(sample);
                    }

                    if tx.is_closed() {
                        // Forward loop gone
                        break;
                    }
                    // P4.3: bounded queue sheds oldest under load instead of
                    // queueing latency.
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
