use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use audio::{AudioDevice, AudioCaptureStatus};
use meeting_detection::MeetingDetectionHint;

pub mod audio;
pub mod meeting_detection;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn audio_capture_list_devices() -> Result<Vec<AudioDevice>, String> {
    audio::engine::list_devices()
}

#[tauri::command]
fn audio_capture_start(
    app: AppHandle,
    state: State<'_, audio::AudioState>,
    session_id: String,
    mic_device_id: Option<String>,
    sys_device_id: Option<String>,
    role: String,
) -> Result<(), String> {
    let mut is_capturing = state.is_capturing.blocking_lock();
    if *is_capturing {
        return Err("Capture is already running".to_string());
    }

    // Start engine
    let handles = audio::engine::start_capture(app.clone(), session_id.clone(), mic_device_id, sys_device_id, role)?;

    // Keep the stream alive by moving it to a background thread
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    
    *state.stop_tx.blocking_lock() = Some(tx);
    *state.current_session.blocking_lock() = Some(session_id);
    *is_capturing = true;

    // Stream must not drop before we stop
    tauri::async_runtime::spawn(async move {
        // Wait for a stop signal
        let _ = rx.recv().await;
        // Dropping handles will stop the cpal capture and abort tasks
        drop(handles);
    });

    Ok(())
}

#[tauri::command]
fn audio_capture_stop(state: State<'_, audio::AudioState>) -> Result<(), String> {
    let mut is_capturing = state.is_capturing.blocking_lock();
    if !*is_capturing {
        return Err("Capture is not running".to_string());
    }

    if let Some(tx) = state.stop_tx.blocking_lock().take() {
        let _ = tx.try_send(());
    }

    *state.current_session.blocking_lock() = None;
    *is_capturing = false;

    Ok(())
}

#[tauri::command]
fn audio_capture_status(state: State<'_, audio::AudioState>) -> Result<AudioCaptureStatus, String> {
    let is_capturing = *state.is_capturing.blocking_lock();
    
    Ok(AudioCaptureStatus {
        active: is_capturing,
        backend: if cfg!(target_os = "windows") {
            "wasapi".to_string()
        } else if cfg!(target_os = "macos") {
            "screencapturekit-fallback".to_string()
        } else {
            "alsa-monitor".to_string()
        },
        error: None,
    })
}

#[tauri::command]
fn meeting_detection_check_heuristic() -> Result<Option<MeetingDetectionHint>, String> {
    meeting_detection::check_process_or_audio_heuristic()
}

#[tauri::command]
fn create_overlay_window(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    WebviewWindowBuilder::new(&app, "meeting-overlay", WebviewUrl::External(parsed))
        .title("Larity Meeting")
        .inner_size(376.0, 480.0)
        .min_inner_size(320.0, 360.0)
        .max_inner_size(420.0, 540.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(audio::AudioState::default());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            create_overlay_window,
            audio_capture_list_devices,
            audio_capture_start,
            audio_capture_stop,
            audio_capture_status,
            meeting_detection_check_heuristic,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
