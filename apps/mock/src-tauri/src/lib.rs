use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let window = app.get_webview_window("main").unwrap();

      // Enforce always on top programmatically
      let _ = window.set_always_on_top(true);

      #[cfg(target_os = "macos")]
      let _ = window_vibrancy::apply_vibrancy(
          &window,
          window_vibrancy::NSVisualEffectMaterial::HudWindow,
          None,
          None,
      );

      #[cfg(target_os = "windows")]
      let _ = window_vibrancy::apply_blur(&window, Some((18, 18, 18, 125)));

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
