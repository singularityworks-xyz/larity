// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's accelerated compositing/DMABUF renderer can fail to
    // initialize an EGL display on some Linux GPU/driver combos, which
    // leaves the main window completely blank (EGL_BAD_PARAMETER). Force
    // software rendering up front so production builds match `tauri dev`,
    // which already sets WEBKIT_DISABLE_COMPOSITING_MODE=1.
    #[cfg(target_os = "linux")]
    {
        // SAFETY: set_var is only unsound when multiple threads mutate the
        // environment concurrently; this runs single-threaded at process
        // start, before any other threads or WebKitGTK initialization.
        unsafe {
            if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
                std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
            }
            if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            }
        }
    }

    desktop_lib::run()
}
