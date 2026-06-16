use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use audio::{AudioDevice, AudioCaptureStatus, VadState};
use meeting_detection::MeetingDetectionHint;

pub mod audio;
pub mod meeting_detection;

#[cfg(target_os = "linux")]
mod linux_media_permission {
    use serde::{Deserialize, Serialize};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use tauri::{AppHandle, Manager};
    use webkit2gtk::glib::object::Cast;
    use webkit2gtk::{
        PermissionRequest, PermissionRequestExt, UserMediaPermissionRequest,
        UserMediaPermissionRequestExt, WebViewExt,
    };

    const DECISION_FILE_NAME: &str = "linux_media_permission.json";

    #[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
    #[serde(rename_all = "snake_case")]
    pub enum Decision {
        Allow,
        Deny,
    }

    #[derive(Debug, Serialize, Deserialize)]
    struct DecisionFile {
        decision: Decision,
    }

    pub struct PermissionStore {
        path: PathBuf,
        decision: Mutex<Option<Decision>>,
    }

    impl PermissionStore {
        pub fn new(path: PathBuf) -> Self {
            let decision = Self::load_from_disk(&path);
            Self {
                path,
                decision: Mutex::new(decision),
            }
        }

        pub fn get(&self) -> Option<Decision> {
            self.decision.lock().ok().and_then(|value| *value)
        }

        pub fn set(&self, decision: Decision) -> Result<(), String> {
            {
                let mut guard = self
                    .decision
                    .lock()
                    .map_err(|_| "Failed to lock media permission state".to_string())?;
                *guard = Some(decision);
            }
            self.persist(Some(decision))
        }

        pub fn reset(&self) -> Result<(), String> {
            {
                let mut guard = self
                    .decision
                    .lock()
                    .map_err(|_| "Failed to lock media permission state".to_string())?;
                *guard = None;
            }
            self.persist(None)
        }

        fn load_from_disk(path: &PathBuf) -> Option<Decision> {
            let raw = fs::read_to_string(path).ok()?;
            let parsed = serde_json::from_str::<DecisionFile>(&raw).ok()?;
            Some(parsed.decision)
        }

        fn persist(&self, decision: Option<Decision>) -> Result<(), String> {
            if let Some(parent) = self.path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            match decision {
                Some(value) => {
                    let payload = DecisionFile { decision: value };
                    let raw = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
                    fs::write(&self.path, raw).map_err(|e| e.to_string())
                }
                None => {
                    if self.path.exists() {
                        fs::remove_file(&self.path).map_err(|e| e.to_string())?;
                    }
                    Ok(())
                }
            }
        }
    }

    fn prompt_user_for_media_permission() -> Decision {
        let allow = rfd::MessageDialog::new()
            .set_title("Microphone Permission")
            .set_description(
                "Allow microphone access for VAD correlation?\n\nIf denied, your speech may be treated as EXTERNAL instead of TEAM MEMBER.",
            )
            .set_buttons(rfd::MessageButtons::YesNo)
            .set_level(rfd::MessageLevel::Info)
            .show();
        if matches!(
            allow,
            rfd::MessageDialogResult::Yes | rfd::MessageDialogResult::Ok
        ) {
            Decision::Allow
        } else {
            Decision::Deny
        }
    }

    pub fn configure_permission_handler(app: &tauri::App) -> Result<(), String> {
        let path_resolver = app.path();
        let config_dir = path_resolver
            .app_config_dir()
            .map_err(|e| format!("Failed to get app config directory: {e}"))?;
        let store_path = config_dir.join(DECISION_FILE_NAME);
        app.manage(PermissionStore::new(store_path));

        let window = app
            .get_webview_window("main")
            .ok_or("Main window not found".to_string())?;
        let app_handle = app.handle().clone();

        window
            .with_webview(move |webview| {
                let wv = webview.inner();
                let app_handle = app_handle.clone();

                wv.connect_permission_request(move |_view, request: &PermissionRequest| {
                    let Some(media_request) = request.downcast_ref::<UserMediaPermissionRequest>() else {
                        // Let non-media requests follow WebKit defaults.
                        return false;
                    };
                    if media_request.is_for_video_device() {
                        // This app only needs microphone access for VAD.
                        request.deny();
                        return true;
                    }
                    if !media_request.is_for_audio_device() {
                        return false;
                    }

                    let Some(store) = app_handle.try_state::<PermissionStore>() else {
                        request.deny();
                        return true;
                    };

                    if let Some(decision) = store.get() {
                        match decision {
                            Decision::Allow => request.allow(),
                            Decision::Deny => request.deny(),
                        }
                        return true;
                    }

                    let decision = prompt_user_for_media_permission();
                    if let Err(error) = store.set(decision) {
                        eprintln!("Failed to persist media permission decision: {error}");
                    }

                    match decision {
                        Decision::Allow => request.allow(),
                        Decision::Deny => request.deny(),
                    }
                    true
                });
            })
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn linux_media_permission_get_decision(app: AppHandle) -> Result<String, String> {
        let Some(store) = app.try_state::<PermissionStore>() else {
            return Ok("unset".to_string());
        };
        Ok(match store.get() {
            Some(Decision::Allow) => "allow".to_string(),
            Some(Decision::Deny) => "deny".to_string(),
            None => "unset".to_string(),
        })
    }

    pub fn linux_media_permission_reset(app: AppHandle) -> Result<(), String> {
        let Some(store) = app.try_state::<PermissionStore>() else {
            return Ok(());
        };
        store.reset()
    }

    pub fn linux_media_permission_ensure_prompt(app: AppHandle) -> Result<String, String> {
        let Some(store) = app.try_state::<PermissionStore>() else {
            return Ok("deny".to_string());
        };
        if let Some(decision) = store.get() {
            return Ok(match decision {
                Decision::Allow => "allow".to_string(),
                Decision::Deny => "deny".to_string(),
            });
        }
        let decision = prompt_user_for_media_permission();
        store.set(decision)?;
        Ok(match decision {
            Decision::Allow => "allow".to_string(),
            Decision::Deny => "deny".to_string(),
        })
    }
}

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
async fn create_overlay_window(app: AppHandle, url: String) -> Result<(), String> {
    // Extract path+query from the URL so we can use WebviewUrl::App.
    // WebviewUrl::External skips Tauri IPC bridge injection on Windows WebView2,
    // which causes the overlay to render completely blank (no JS runs).
    let path_and_query = if let Ok(parsed) = tauri::Url::parse(&url) {
        let path = parsed.path();
        match parsed.query() {
            Some(q) => format!("{path}?{q}"),
            None => path.to_string(),
        }
    } else {
        // Fall back to treating the raw string as a path
        url
    };

    // Start hidden: show only after the page has painted to avoid white flash.
    // On Windows, WebView2's .build() must NOT be called from a sync command
    // handler — it blocks the IPC thread causing a deadlock → blank window.
    // Making the command `async` moves it off the IPC thread, fixing this.
    // on_page_load is a *builder* method in Tauri 2.x (not a window method).
    let _window = WebviewWindowBuilder::new(
        &app,
        "meeting-overlay",
        WebviewUrl::App(path_and_query.into()),
    )
    .title("Larity Meeting")
    .inner_size(376.0, 480.0)
    .min_inner_size(320.0, 360.0)
    .max_inner_size(420.0, 540.0)
    .decorations(false)
    .always_on_top(true)
    .resizable(true)
    .transparent(true)
    .visible(false)
    // Reveal only after the page finishes loading to avoid blank white flash.
    .on_page_load(|win, payload| {
        use tauri::webview::PageLoadEvent;
        if payload.event() == PageLoadEvent::Finished {
            let _ = win.show();
            let _ = win.set_focus();
        }
    })
    .build()
    .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let _ = window_vibrancy::apply_vibrancy(
        &_window,
        window_vibrancy::NSVisualEffectMaterial::HudWindow,
        None,
        None,
    );

    #[cfg(target_os = "windows")]
    let _ = window_vibrancy::apply_blur(&_window, Some((18, 18, 18, 125)));

    Ok(())
}

#[tauri::command]
fn vad_start(app: AppHandle, state: State<'_, VadState>) -> Result<(), String> {
    let vad_tx = audio::vad::spawn_vad_task(app).map_err(|e| e.to_string())?;
    *state.vad_tx.blocking_lock() = Some(vad_tx);
    Ok(())
}

#[tauri::command]
fn vad_stop(state: State<'_, VadState>) -> Result<(), String> {
    *state.vad_tx.blocking_lock() = None;
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn linux_media_permission_get_decision(app: AppHandle) -> Result<String, String> {
    linux_media_permission::linux_media_permission_get_decision(app)
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn linux_media_permission_reset(app: AppHandle) -> Result<(), String> {
    linux_media_permission::linux_media_permission_reset(app)
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn linux_media_permission_ensure_prompt(app: AppHandle) -> Result<String, String> {
    linux_media_permission::linux_media_permission_ensure_prompt(app)
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn linux_media_permission_get_decision() -> Result<String, String> {
    Ok("unsupported".to_string())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn linux_media_permission_reset() -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn linux_media_permission_ensure_prompt() -> Result<String, String> {
    Ok("allow".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(audio::AudioState::default());
            app.manage(audio::VadState::default());
            #[cfg(target_os = "linux")]
            {
                linux_media_permission::configure_permission_handler(app)?;
            }
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
            vad_start,
            vad_stop,
            linux_media_permission_get_decision,
            linux_media_permission_reset,
            linux_media_permission_ensure_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
