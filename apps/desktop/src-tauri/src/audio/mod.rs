use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub mod engine;
pub mod processor;

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
}

#[derive(Clone)]
pub struct AudioState {
    pub is_capturing: Arc<Mutex<bool>>,
    pub current_session: Arc<Mutex<Option<String>>>,
    // Channel for stopping the capture thread
    pub stop_tx: Arc<Mutex<Option<tokio::sync::mpsc::Sender<()>>>>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            is_capturing: Arc::new(Mutex::new(false)),
            current_session: Arc::new(Mutex::new(None)),
            stop_tx: Arc::new(Mutex::new(None)),
        }
    }
}
