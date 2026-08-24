// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux GPU and Wayland rendering configuration.
    //
    // WebKitGTK's DMABUF renderer uses DRM/GBM for zero-copy GPU frame delivery
    // to the Wayland compositor (KWin). This is the correct path for AMD/Intel
    // Mesa drivers. However, NVIDIA on nouveau/llvmpipe cannot open an EGL display
    // from GBM and crashes with "EGL_BAD_PARAMETER. Aborting...".
    //
    // Strategy: probe for a DRM render node (/dev/dri/renderD*). If one exists,
    // the GPU driver is Mesa-compatible and DMABUF works. If not (nouveau/VM),
    // fall back to shared memory rendering.
    //
    // Additionally, force GDK to the native Wayland backend (not XWayland) so
    // that KWin compositor effects (wobbly windows, window blur, rounded corners,
    // fractional scaling) are applied via the Wayland protocol stack rather than
    // the Xwayland compatibility bridge, which does not support these protocols.
    //
    // All env vars are set single-threaded before WebKitGTK/GTK initialisation.
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

            // Probe for a DRM render node — present on AMD (radeonsi), Intel (iris),
            // and any Mesa-capable GPU. Absent on NVIDIA nouveau, llvmpipe, and VMs.
            let has_drm_render_node = std::fs::read_dir("/dev/dri")
                .map(|d| {
                    d.filter_map(|e| e.ok())
                        .any(|e| e.file_name().to_string_lossy().starts_with("renderD"))
                })
                .unwrap_or(false);

            if has_drm_render_node {
                // Mesa GPU detected: allow the DMABUF renderer to use the DRM/GBM path.
                // This enables zero-copy GPU frame delivery to the Wayland compositor
                // and full hardware-accelerated compositing (CSS transforms, filters,
                // backdrop-blur at GPU speed). Do NOT disable it.
                // Note: individual variables may still be overridden by the user's env.
            } else {
                // No DRM render node: NVIDIA nouveau / llvmpipe / VM.
                // Disable DMABUF to avoid EGL display allocation crash on startup.
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
