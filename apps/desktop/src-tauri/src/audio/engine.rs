use crate::audio::processor::AudioProcessor;
use crate::audio::AudioDevice;
use crate::audio::mixer::{AudioMixer, MixerMessage, SourceType};
use crate::audio::VadState;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, Stream};
use tauri::{AppHandle, Manager};
use std::sync::Arc;

pub struct CaptureHandles {
    pub _mic_stream: Option<Stream>,
    pub _sys_stream: Option<Stream>,
    pub sys_task: Option<tauri::async_runtime::JoinHandle<()>>,
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

pub fn start_capture(
    app: AppHandle,
    session_id: String,
    mic_device_id: Option<String>,
    _sys_device_id: Option<String>,
    role: String,
) -> Result<CaptureHandles, String> {
    let host = cpal::default_host();

    let mixer = Arc::new(AudioMixer::new(app.clone(), session_id.clone(), role.clone()));

    // 1. Setup Microphone
    let mic_device = if let Some(id) = mic_device_id.clone() {
        host.input_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.id().map(|did| did.to_string()).unwrap_or_default() == id)
            .or_else(|| host.default_input_device())
            .ok_or("No microphone device available")?
    } else {
        host.default_input_device()
            .ok_or("No default input device available")?
    };

    println!("Using Mic device: {}", mic_device.id().map(|id| id.to_string()).unwrap_or_default());
    let mic_config = mic_device.default_input_config().map_err(|e| e.to_string())?;
    
    let mic_format = mic_config.sample_format();
    let mic_config: cpal::StreamConfig = mic_config.into();
    
    let mut mic_processor = AudioProcessor::new(mic_config.sample_rate as usize, mic_config.channels as usize);
    let mixer_clone = mixer.clone();

    let err_fn = move |err| {
        eprintln!("an error occurred on stream: {}", err);
    };

    let mic_stream = match mic_format {
        cpal::SampleFormat::F32 => {
            let app_vad = app.clone();
            mic_device.build_input_stream(
                &mic_config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let chunks = mic_processor.process(data);
                    for chunk in chunks {
                        let ts = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64;
                        if let Some(vad_state) = app_vad.try_state::<VadState>() {
                            if let Ok(guard) = vad_state.vad_tx.try_lock() {
                                if let Some(vad_tx) = &*guard {
                                    vad_tx.send(chunk.clone());
                                }
                            }
                        }
                        mixer_clone.send(MixerMessage {
                            source: SourceType::Mic,
                            timestamp_ms: ts,
                            samples: chunk,
                        });
                    }
                },
                err_fn.clone(),
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let app_vad = app.clone();
            mic_device.build_input_stream(
                &mic_config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let f32_data: Vec<f32> = data.iter().map(|&s| s.to_sample::<f32>()).collect();
                    let chunks = mic_processor.process(&f32_data);
                    for chunk in chunks {
                        let ts = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64;
                        if let Some(vad_state) = app_vad.try_state::<VadState>() {
                            if let Ok(guard) = vad_state.vad_tx.try_lock() {
                                if let Some(vad_tx) = &*guard {
                                    vad_tx.send(chunk.clone());
                                }
                            }
                        }
                        mixer_clone.send(MixerMessage {
                            source: SourceType::Mic,
                            timestamp_ms: ts,
                            samples: chunk,
                        });
                    }
                },
                err_fn.clone(),
                None,
            )
        }
        _ => return Err("Unsupported sample format".into()),
    }.map_err(|e| e.to_string())?;

    mic_stream.play().map_err(|e| e.to_string())?;

    let mut sys_stream = None;
    let mut sys_task = None;

    // 2. Setup System Audio (only if host)
    if role == "host" {
        if cfg!(target_os = "linux") {
            #[cfg(target_os = "linux")]
            {
                let mixer_clone = mixer.clone();
                let task = crate::audio::linux_capture::start_linux_sys_capture(mixer_clone.tx.clone());
                sys_task = Some(task);
            }
        } else {
            // macOS / Windows fallback to loopback with cpal
            let sys_device = host.default_output_device()
                .ok_or("No default output device available for loopback")?;
            println!("Using Sys device: {}", sys_device.id().map(|id| id.to_string()).unwrap_or_default());
            
            let sys_config = sys_device.default_input_config()
                .or_else(|_| sys_device.default_output_config())
                .map_err(|e| e.to_string())?;
            
            let sys_format = sys_config.sample_format();
            let sys_config: cpal::StreamConfig = sys_config.into();
            let mut sys_processor = AudioProcessor::new(sys_config.sample_rate as usize, sys_config.channels as usize);
            let mixer_clone = mixer.clone();

            let stream = match sys_format {
                cpal::SampleFormat::F32 => sys_device.build_input_stream(
                    &sys_config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        let chunks = sys_processor.process(data);
                        for chunk in chunks {
                            let ts = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64;
                            mixer_clone.send(MixerMessage {
                                source: SourceType::Sys,
                                timestamp_ms: ts,
                                samples: chunk,
                            });
                        }
                    },
                    err_fn,
                    None,
                ),
                cpal::SampleFormat::I16 => sys_device.build_input_stream(
                    &sys_config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s.to_sample::<f32>()).collect();
                        let chunks = sys_processor.process(&f32_data);
                        for chunk in chunks {
                            let ts = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64;
                            mixer_clone.send(MixerMessage {
                                source: SourceType::Sys,
                                timestamp_ms: ts,
                                samples: chunk,
                            });
                        }
                    },
                    err_fn,
                    None,
                ),
                _ => return Err("Unsupported sample format".into()),
            }.map_err(|e| e.to_string())?;
            
            stream.play().map_err(|e| e.to_string())?;
            sys_stream = Some(stream);
        }
    }

    Ok(CaptureHandles {
        _mic_stream: Some(mic_stream),
        _sys_stream: sys_stream,
        sys_task,
        _mixer: Some(mixer),
    })
}
