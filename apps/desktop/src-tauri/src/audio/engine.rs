use crate::audio::processor::AudioProcessor;
use crate::audio::AudioDevice;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, Stream, SupportedStreamConfig};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

pub fn list_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let default_in = host
        .default_input_device()
        .map(|d| d.name().unwrap_or_default());

    for device in devices {
        if let Ok(name) = device.name() {
            let is_default = Some(&name) == default_in.as_ref();
            result.push(AudioDevice {
                id: name.clone(),
                name,
                is_default,
            });
        }
    }

    Ok(result)
}

pub fn start_capture(app: AppHandle, session_id: String) -> Result<Stream, String> {
    let host = cpal::default_host();

    // Loopback logic varies per OS
    let device = if cfg!(target_os = "windows") {
        host.default_output_device()
            .ok_or("No default output device available for WASAPI loopback")?
    } else if cfg!(target_os = "linux") {
        // Find default output, then find a monitor device with the same name, or just grab the first monitor
        let default_out = host
            .default_output_device()
            .map(|d| d.name().unwrap_or_default())
            .unwrap_or_default();

        let mut target_device = None;
        if let Ok(devices) = host.input_devices() {
            for d in devices {
                if let Ok(name) = d.name() {
                    // Typical PulseAudio/PipeWire monitor naming
                    if name.to_lowercase().contains("monitor")
                        || name.to_lowercase().contains(&default_out.to_lowercase())
                    {
                        target_device = Some(d);
                        break;
                    }
                }
            }
        }
        target_device.unwrap_or_else(|| {
            host.default_input_device()
                .expect("No default input device available")
        })
    } else {
        host.default_input_device()
            .ok_or("No default input device available")?
    };

    println!("Using device: {}", device.name().unwrap_or_default());

    let config = device.default_input_config().map_err(|e| e.to_string())?;
    println!("Config: {:?}", config);

    let sample_format = config.sample_format();
    let config: cpal::StreamConfig = config.into();

    let mut processor =
        AudioProcessor::new(config.sample_rate as usize, config.channels as usize);

    let err_fn = move |err| {
        eprintln!("an error occurred on stream: {}", err);
    };

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            device.build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let chunks = processor.process(data);
                    for chunk in chunks {
                        // Attach timestamp and send to frontend
                        let ts = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis();
                        
                        app.emit("audio-frame", serde_json::json!({
                            "sessionId": session_id,
                            "ts": ts,
                            "data": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &chunk),
                        })).unwrap();
                    }
                },
                err_fn,
                None,
            )
        },
        cpal::SampleFormat::I16 => {
            device.build_input_stream(
                &config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let f32_data: Vec<f32> = data.iter().map(|&s| s.to_sample::<f32>()).collect();
                    let chunks = processor.process(&f32_data);
                    for chunk in chunks {
                        let ts = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis();
                        
                        app.emit("audio-frame", serde_json::json!({
                            "sessionId": session_id,
                            "ts": ts,
                            "data": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &chunk),
                        })).unwrap();
                    }
                },
                err_fn,
                None,
            )
        },
        _ => return Err("Unsupported sample format".into()),
    }.map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;

    Ok(stream)
}
