// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF renderer allocates an EGL display at startup, which
    // fails on hosts whose GPU driver doesn't expose a working EGL (e.g.
    // NVIDIA cards on nouveau/llvmpipe): "Could not create default EGL
    // display: EGL_BAD_PARAMETER. Aborting...". The window then stays blank
    // because the web content never gets composited.
    //
    // `bun run dev` is unaffected because it runs against the *system*
    // WebKitGTK with WEBKIT_DISABLE_COMPOSITING_MODE=1, but the packaged
    // AppImage ships a different WebKitGTK whose DMABUF renderer is active.
    // Force the DMABUF renderer to use shared memory (no EGL/GBM) and disable
    // accelerated compositing so production matches dev and renders purely in
    // software. Set these up front, single-threaded, before WebKitGTK init.
    #[cfg(target_os = "linux")]
    {
        // SAFETY: set_var is only unsound when multiple threads mutate the
        // environment concurrently; this runs single-threaded at process
        // start, before any other threads or WebKitGTK initialization.
        unsafe {
            if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
                std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
            }
            if std::env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_none() {
                std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
            }
        }
    }

    desktop_lib::run()
}
