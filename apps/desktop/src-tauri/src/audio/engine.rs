use crate::audio::AudioDevice;
use crate::audio::VadState;
use crate::audio::amplitude::{AmplitudeListeners, should_emit_amplitude};
use crate::audio::mixer::{AudioMixer, MixerMessage, SourceType};
use crate::audio::processor::AudioProcessor;
use crate::audio::ring::SpscRing;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, Stream};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter, Manager};

/// Ring capacity in mono f32 samples (P4.2). 65536 ≈ 0.7 s at 48 kHz
/// stereo, ≈ 4 s at 16 kHz mono — deep enough to ride out scheduling
/// jitter, shallow enough that a stuck worker drops instead of lagging.
const RING_CAPACITY: usize = 65536;
/// Scratch + conversion quantum for the worker and the callback (P4.2).
const WORK_QUANTUM: usize = 8192;

/// Requested cpal device period in frames (P4.6). Matches the rubato input
/// quantum (`RESAMPLE_CHUNK` in `processor.rs`) so each wake completes one
/// quantum after downmix instead of batching ~21 ms in the device default.
const CPAL_BUFFER_FRAMES: u32 = 512;

fn short_hash(s: &str) -> String {
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    format!("{:08x}", hasher.finish() as u32)
}

pub(crate) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Owns one capture worker thread (P4.2). Dropping signals exit, wakes the
/// worker, and joins it so no thread outlives its stream.
pub struct StreamWorker {
    join: Option<std::thread::JoinHandle<()>>,
    running: Arc<AtomicBool>,
}

/// Bundled `StreamWorker::spawn` arguments (keeps the constructor arity down).
struct WorkerParams {
    amplitude: AmplitudeListeners,
    app: AppHandle,
    is_mic: bool,
    mixer: Option<Arc<AudioMixer>>,
    name: &'static str,
    processor: AudioProcessor,
    ring: Arc<SpscRing>,
    running: Arc<AtomicBool>,
    source: SourceType,
}

impl StreamWorker {
    fn thread_handle(&self) -> std::thread::Thread {
        self.join
            .as_ref()
            .expect("worker thread handle")
            .thread()
            .clone()
    }

    fn spawn(params: WorkerParams) -> Self {
        let WorkerParams {
            amplitude,
            app,
            is_mic,
            mixer,
            name,
            processor,
            ring,
            running,
            source,
        } = params;
        let running_clone = running.clone();
        let join = std::thread::Builder::new()
            .name(name.to_string())
            .spawn(move || {
                run_capture_worker(
                    ring,
                    running_clone,
                    processor,
                    app,
                    mixer,
                    source,
                    is_mic,
                    amplitude,
                );
            })
            .expect("capture worker thread");
        Self {
            join: Some(join),
            running,
        }
    }
}

impl Drop for StreamWorker {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Release);
        if let Some(join) = self.join.take() {
            join.thread().unpark();
            let _ = join.join();
        }
    }
}

/// Worker body (P4.2): everything the cpal callback used to do — downmix →
/// resample → 512-sample framing → VAD send → mixer send → amplitude emit.
/// Runs on a plain thread; allocations and clock reads are fine here. They
/// are banned only from the cpal callback, which now just memcpys into the
/// ring and unparks this worker.
#[allow(clippy::too_many_arguments)]
fn run_capture_worker(
    ring: Arc<SpscRing>,
    running: Arc<AtomicBool>,
    mut processor: AudioProcessor,
    app: AppHandle,
    mixer: Option<Arc<AudioMixer>>,
    source: SourceType,
    is_mic: bool,
    amplitude: AmplitudeListeners,
) {
    let mut work = vec![0.0f32; WORK_QUANTUM];
    let mut frames: Vec<Vec<i16>> = Vec::new();
    let mut last_display_amp: f32 = 0.0;
    let mut last_amp_emit_ms: u64 = 0;

    loop {
        let n = ring.pop(&mut work);
        if n == 0 {
            if !running.load(Ordering::Acquire) {
                break;
            }
            std::thread::park();
            continue;
        }

        processor.process_into(&work[..n], &mut frames);
        for chunk in frames.drain(..) {
            let ts = now_ms();

            if is_mic {
                if let Some(vad_state) = app.try_state::<VadState>()
                    && let Ok(guard) = vad_state.vad_tx.try_lock()
                    && let Some(vad_tx) = &*guard
                {
                    vad_tx.send(chunk.clone());
                }

                // Calculate true RMS over normalised [-1.0, 1.0] i16 samples
                let sum_sq: f32 = chunk
                    .iter()
                    .map(|&x| {
                        let f = x as f32 / i16::MAX as f32;
                        f * f
                    })
                    .sum();
                let rms = (sum_sq / chunk.len() as f32).sqrt();
                let display_amp = (rms * 2.5).min(1.0);

                // P4.4: ≤15 Hz, overlay window only (the sole consumer),
                // and only while a listener is registered. The delta check
                // stays — most chunks change nothing worth emitting.
                if ((display_amp - last_display_amp).abs() > 0.015
                    || (display_amp == 0.0 && last_display_amp != 0.0))
                    && should_emit_amplitude(&amplitude, last_amp_emit_ms, ts)
                {
                    last_display_amp = display_amp;
                    last_amp_emit_ms = ts;
                    let _ = app.emit_to(
                        crate::audio::OVERLAY_WINDOW_LABEL,
                        "raw-mic-amplitude",
                        display_amp,
                    );
                }
            }

            if let Some(m) = &mixer {
                m.send(MixerMessage {
                    source,
                    timestamp_ms: ts,
                    samples: chunk,
                });
            }
        }

        if !running.load(Ordering::Acquire) && ring.is_empty() {
            break;
        }
    }

    let dropped = ring.dropped();
    if dropped > 0 {
        eprintln!("capture worker exit: ring dropped {dropped} samples (worker behind)");
    }
}

pub struct CaptureHandles {
    pub _mic_stream: Option<Stream>,
    pub _sys_stream: Option<Stream>,
    pub _mic_worker: Option<StreamWorker>,
    pub _sys_worker: Option<StreamWorker>,
    pub sys_task: Option<tauri::async_runtime::JoinHandle<()>>,
    /// Reason system/loopback capture is absent (`None` = full capture or VAD-only role).
    pub sys_error: Option<String>,
    pub _mixer: Option<Arc<AudioMixer>>,
}

impl Drop for CaptureHandles {
    fn drop(&mut self) {
        if let Some(task) = self.sys_task.take() {
            task.abort();
        }
    }
}

pub fn list_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let default_id = host
        .default_input_device()
        .and_then(|d| d.id().ok())
        .map(|id| id.to_string());

    for device in devices {
        if let (Ok(desc), Ok(dev_id)) = (device.description(), device.id()) {
            let name = desc.name().to_string();
            let id = dev_id.to_string();
            let is_default = Some(&id) == default_id.as_ref();
            result.push(AudioDevice {
                id,
                name,
                is_default,
            });
        }
    }

    Ok(result)
}

/// Build an f32 input stream with a small fixed device buffer (P4.6),
/// falling back to the device default when the backend rejects the size
/// (e.g. WASAPI shared mode only accepts the device period). The cpal
/// callbacks stay RT-safe: ring push + unpark only.
fn build_f32_input_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    ring: &Arc<SpscRing>,
    unpark: &std::thread::Thread,
    err_fn: fn(cpal::StreamError),
) -> Result<Stream, String> {
    let attempt = |cfg: &cpal::StreamConfig, ring: Arc<SpscRing>, unpark: std::thread::Thread| {
        device.build_input_stream(
            cfg,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                ring.push(data);
                unpark.unpark();
            },
            err_fn,
            None,
        )
    };
    let mut small = config.clone();
    small.buffer_size = cpal::BufferSize::Fixed(CPAL_BUFFER_FRAMES);
    attempt(&small, ring.clone(), unpark.clone()).or_else(|first_err| {
        eprintln!(
            "cpal fixed {CPAL_BUFFER_FRAMES}-frame buffer rejected ({first_err}); using device default"
        );
        attempt(config, ring.clone(), unpark.clone()).map_err(|e| e.to_string())
    })
}

/// Same as `build_f32_input_stream` for i16 devices, converting to f32 in a
/// callback-local scratch buffer (allocated once per attempt, outside the
/// RT path).
fn build_i16_input_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    ring: &Arc<SpscRing>,
    unpark: &std::thread::Thread,
    err_fn: fn(cpal::StreamError),
) -> Result<Stream, String> {
    let attempt = |cfg: &cpal::StreamConfig, ring: Arc<SpscRing>, unpark: std::thread::Thread| {
        let mut conv = vec![0.0f32; WORK_QUANTUM];
        device.build_input_stream(
            cfg,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                for piece in data.chunks(conv.len()) {
                    for (d, s) in conv[..piece.len()].iter_mut().zip(piece.iter()) {
                        *d = s.to_sample::<f32>();
                    }
                    ring.push(&conv[..piece.len()]);
                }
                unpark.unpark();
            },
            err_fn,
            None,
        )
    };
    let mut small = config.clone();
    small.buffer_size = cpal::BufferSize::Fixed(CPAL_BUFFER_FRAMES);
    attempt(&small, ring.clone(), unpark.clone()).or_else(|first_err| {
        eprintln!(
            "cpal fixed {CPAL_BUFFER_FRAMES}-frame buffer rejected ({first_err}); using device default"
        );
        attempt(config, ring.clone(), unpark.clone()).map_err(|e| e.to_string())
    })
}

pub fn start_capture(
    app: AppHandle,
    _session_id: String,
    mic_device_id: Option<String>,
    _sys_device_id: Option<String>,
    role: String,
    on_audio_frame: Channel<Response>,
) -> Result<CaptureHandles, String> {
    let host = cpal::default_host();

    let is_host = role == "host";
    // P4.1: raw frames travel over the JS-provided Channel (ArrayBuffer on
    // arrival) instead of base64/JSON `audio-frame` emits.
    let mixer = if is_host {
        Some(Arc::new(AudioMixer::new(on_audio_frame)))
    } else {
        None
    };

    // 1. Setup Microphone
    let mic_device = if let Some(id) = mic_device_id.clone() {
        let devices = host.input_devices().map_err(|e| e.to_string())?;
        let mut found = None;
        for d in devices {
            if d.id()
                .map(|did| did.to_string())
                .map_err(|e| e.to_string())?
                == id
            {
                found = Some(d);
                break;
            }
        }
        found
            .or_else(|| host.default_input_device())
            .ok_or("No microphone device available")?
    } else {
        host.default_input_device()
            .ok_or("No default input device available")?
    };

    let mic_id = mic_device
        .id()
        .map(|id| id.to_string())
        .map_err(|e| e.to_string())?;
    println!("Using Mic device (hash): {}", short_hash(&mic_id));
    let mic_config = mic_device
        .default_input_config()
        .map_err(|e| e.to_string())?;

    let mic_format = mic_config.sample_format();
    let mic_config: cpal::StreamConfig = mic_config.into();

    let mic_processor = AudioProcessor::new(
        mic_config.sample_rate as usize,
        mic_config.channels as usize,
    );

    let err_fn: fn(cpal::StreamError) = |err| {
        eprintln!("an error occurred on stream: {}", err);
    };

    // P4.2: the cpal callback only memcpys into the ring and unparks the
    // worker. No allocations, no `SystemTime::now()`, no `app.emit`, no
    // (tokio) mutex locks. Verify by reading the two closures below.
    let mic_ring = Arc::new(SpscRing::new(RING_CAPACITY));
    let mic_running = Arc::new(AtomicBool::new(true));
    // P4.4: the worker emits amplitude only while a JS listener is
    // registered (overlay visualizers / VadManager).
    let amplitude = app
        .try_state::<VadState>()
        .map(|state| state.amplitude_listeners.clone())
        .unwrap_or_default();
    let mic_worker = StreamWorker::spawn(WorkerParams {
        amplitude: amplitude.clone(),
        app: app.clone(),
        is_mic: true,
        mixer: mixer.clone(),
        name: "larity-mic-capture",
        processor: mic_processor,
        ring: mic_ring.clone(),
        running: mic_running,
        source: SourceType::Mic,
    });
    let mic_unpark = mic_worker.thread_handle();

    let mic_stream = match mic_format {
        cpal::SampleFormat::F32 => {
            build_f32_input_stream(&mic_device, &mic_config, &mic_ring, &mic_unpark, err_fn)
        }
        cpal::SampleFormat::I16 => {
            build_i16_input_stream(&mic_device, &mic_config, &mic_ring, &mic_unpark, err_fn)
        }
        _ => return Err("Unsupported sample format".into()),
    }?;

    mic_stream.play().map_err(|e| e.to_string())?;

    let mut sys_stream = None;
    let mut sys_worker = None;
    let mut sys_task = None;
    let mut sys_error: Option<String> = None;

    // 2. Setup System Audio (only if host / mixer initialized).
    // Best-effort: a loopback failure must not abort mic capture (P1.13).
    // Errors are collected and reported via `audio_capture_status`.
    if let Some(m) = &mixer {
        let setup: Result<(), String> = (|| {
            if cfg!(target_os = "linux") {
                #[cfg(target_os = "linux")]
                {
                    let task = crate::audio::linux_capture::start_linux_sys_capture(m.queue())?;
                    sys_task = Some(task);
                }
            } else {
                // macOS / Windows fallback to loopback with cpal
                let sys_device = host
                    .default_output_device()
                    .ok_or("No default output device available for loopback")?;
                let sys_id = sys_device
                    .id()
                    .map(|id| id.to_string())
                    .map_err(|e| e.to_string())?;
                println!("Using Sys device (hash): {}", short_hash(&sys_id));

                let sys_config = sys_device
                    .default_input_config()
                    .or_else(|_| sys_device.default_output_config())
                    .map_err(|e| e.to_string())?;

                let sys_format = sys_config.sample_format();
                let sys_config: cpal::StreamConfig = sys_config.into();
                let sys_processor = AudioProcessor::new(
                    sys_config.sample_rate as usize,
                    sys_config.channels as usize,
                );

                let sys_ring = Arc::new(SpscRing::new(RING_CAPACITY));
                let sys_running = Arc::new(AtomicBool::new(true));
                let worker = StreamWorker::spawn(WorkerParams {
                    amplitude: amplitude.clone(),
                    app: app.clone(),
                    is_mic: false,
                    mixer: Some(m.clone()),
                    name: "larity-sys-capture",
                    processor: sys_processor,
                    ring: sys_ring.clone(),
                    running: sys_running,
                    source: SourceType::Sys,
                });
                let sys_unpark = worker.thread_handle();
                sys_worker = Some(worker);

                let stream = match sys_format {
                    cpal::SampleFormat::F32 => build_f32_input_stream(
                        &sys_device,
                        &sys_config,
                        &sys_ring,
                        &sys_unpark,
                        err_fn,
                    ),
                    cpal::SampleFormat::I16 => build_i16_input_stream(
                        &sys_device,
                        &sys_config,
                        &sys_ring,
                        &sys_unpark,
                        err_fn,
                    ),
                    _ => return Err("Unsupported sample format".into()),
                }?;

                stream.play().map_err(|e| e.to_string())?;
                sys_stream = Some(stream);
            }
            Ok(())
        })();
        if let Err(e) = setup {
            sys_error = Some(e.clone());
            eprintln!(
                "system audio capture failed, continuing with mic only: {}",
                e
            );
        }
    }

    Ok(CaptureHandles {
        _mic_stream: Some(mic_stream),
        _sys_stream: sys_stream,
        _mic_worker: Some(mic_worker),
        _sys_worker: sys_worker,
        sys_task,
        sys_error,
        _mixer: mixer,
    })
}
