#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // SAFETY: set_var is only unsound when multiple threads mutate the
        // environment concurrently; this runs single-threaded at process
        // start, before any other threads or WebKitGTK initialisation.
        unsafe {
            // Prefer native Wayland backend when running in a Wayland session so
            // KWin/Wayland compositor effects apply (wobbly windows, blur-behind, etc.),
            // with seamless fallback to X11 if the Wayland socket cannot be connected.
            // On pure X11 sessions (where WAYLAND_DISPLAY is unset), leave GDK_BACKEND
            // unset so GTK3 uses its standard auto-detection without aborting.
            if std::env::var_os("GDK_BACKEND").is_none()
                && std::env::var_os("WAYLAND_DISPLAY").is_some()
            {
                std::env::set_var("GDK_BACKEND", "wayland,x11");
            }

            let has_drm_render_node = std::fs::read_dir("/dev/dri")
                .map(|d| {
                    d.filter_map(|e| e.ok())
                        .any(|e| e.file_name().to_string_lossy().starts_with("renderD"))
                })
                .unwrap_or(false);

            if has_drm_render_node {
            } else {
                if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
                    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
                }
                if std::env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_none() {
                    std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
                }
            }
        }
    }

    desktop_lib::run()
}
