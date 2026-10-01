use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use tokio::sync::Mutex;

pub mod amplitude;
pub mod engine;
#[cfg(target_os = "linux")]
pub mod linux_capture;
pub mod mixer;
pub mod processor;
pub mod ring;
pub mod vad;

/// Webview window labels (see `lib.rs` builders). Amplitude events target
/// one window each (P4.4) instead of broadcasting via `app.emit`.
pub const OVERLAY_WINDOW_LABEL: &str = "meeting-overlay";
pub const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioCaptureStatus {
    pub active: bool,
    pub backend: String,
    pub error: Option<String>,
    /// Mixer frames shed by the bounded drop-oldest queue (P4.3).
    pub mixer_drops: u64,
}

#[derive(Clone)]
pub struct AudioState {
    pub is_capturing: Arc<Mutex<bool>>,
    pub current_session: Arc<Mutex<Option<String>>>,
    // Channel for stopping the capture thread
    pub stop_tx: Arc<Mutex<Option<tokio::sync::mpsc::Sender<()>>>>,
    /// True while system/loopback capture runs alongside the mic.
    pub sys_active: Arc<Mutex<bool>>,
    /// Mixer drop-counter handle for the current capture (P4.3). `None`
    /// before the first capture. Only the counter is retained — never the
    /// mixer itself, so dropping capture still closes the queue.
    pub mixer_drops: Arc<Mutex<Option<Arc<AtomicU64>>>>,
    /// Why system capture is absent while mic capture runs (`None` = full
    /// capture, or a VAD-only non-host role that never attempts loopback).
    pub sys_error: Arc<Mutex<Option<String>>>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            is_capturing: Arc::new(Mutex::new(false)),
            current_session: Arc::new(Mutex::new(None)),
            stop_tx: Arc::new(Mutex::new(None)),
            sys_active: Arc::new(Mutex::new(false)),
            mixer_drops: Arc::new(Mutex::new(None)),
            sys_error: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(Clone)]
pub struct VadState {
    pub vad_tx: Arc<Mutex<Option<vad::VadTx>>>,
    /// Refcounted amplitude listeners (P4.4). Toggled from JS via
    /// `vad_set_amplitude_listener`; gates `raw-mic-amplitude` (overlay)
    /// and `vad-amplitude` (main window) at ≤15 Hz.
    pub amplitude_listeners: amplitude::AmplitudeListeners,
}

impl Default for VadState {
    fn default() -> Self {
        Self {
            vad_tx: Arc::new(Mutex::new(None)),
            amplitude_listeners: amplitude::AmplitudeListeners::default(),
        }
    }
}
