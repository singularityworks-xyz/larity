use rubato::{FastFixedIn, PolynomialDegree, Resampler};

const TARGET_SAMPLE_RATE: usize = 16000;
const SAMPLES_PER_FRAME: usize = 512; // 32ms at 16kHz — matches Silero VAD chunk_size exactly
/// Resampler input quantum (P4.6). Matches the requested cpal period
/// (`CPAL_BUFFER_FRAMES` in `engine.rs`) so each device wake completes one
/// quantum after downmix instead of batching ~21 ms in the default buffer.
const RESAMPLE_CHUNK: usize = 512;

pub struct AudioProcessor {
    resampler: Option<FastFixedIn<f32>>,
    /// Preallocated resampler output (len = `output_frames_max()`), reused
    /// across calls so the worker never allocates for resampling (P4.2).
    resample_scratch: Vec<f32>,
    /// Staging input: exactly one `RESAMPLE_CHUNK` (P4.2).
    stage: Box<[f32; RESAMPLE_CHUNK]>,
    _input_sample_rate: usize,
    channels: usize,
    pre_buffer: Vec<f32>,
    post_buffer: Vec<f32>,
    chunk_size: usize,
}

impl AudioProcessor {
    pub fn new(input_sample_rate: usize, channels: usize) -> Self {
        let chunk_size = RESAMPLE_CHUNK; // Fixed input chunk size for the resampler
        let resampler = if input_sample_rate != TARGET_SAMPLE_RATE {
            let r = FastFixedIn::<f32>::new(
                TARGET_SAMPLE_RATE as f64 / input_sample_rate as f64,
                2.0,
                PolynomialDegree::Cubic,
                chunk_size,
                1,
            )
            .expect("Failed to create resampler");
            Some(r)
        } else {
            None
        };

        let resample_scratch = match &resampler {
            Some(r) => vec![0.0; r.output_frames_max()],
            None => Vec::new(),
        };

        Self {
            resampler,
            resample_scratch,
            stage: vec![0.0; RESAMPLE_CHUNK]
                .into_boxed_slice()
                .try_into()
                .expect("stage length is RESAMPLE_CHUNK"),
            _input_sample_rate: input_sample_rate,
            channels,
            pre_buffer: Vec::new(),
            post_buffer: Vec::new(),
            chunk_size,
        }
    }

    pub fn process(&mut self, interleaved_samples: &[f32]) -> Vec<Vec<i16>> {
        let mut chunks = Vec::new();
        self.process_into(interleaved_samples, &mut chunks);
        chunks
    }

    /// Same as `process`, but appends completed 512-sample frames into the
    /// caller-provided `frames_out` (P4.2: the worker reuses that Vec across
    /// drains; only the per-frame `Vec<i16>` payloads allocate, on the
    /// worker thread — never in the cpal callback).
    pub fn process_into(&mut self, interleaved_samples: &[f32], frames_out: &mut Vec<Vec<i16>>) {
        // 1. Downmix to Mono
        for chunk in interleaved_samples.chunks(self.channels) {
            let sum: f32 = chunk.iter().sum();
            self.pre_buffer.push(sum / self.channels as f32);
        }

        // 2. Resample full chunks into the preallocated scratch buffer
        if let Some(resampler) = &mut self.resampler {
            while self.pre_buffer.len() >= self.chunk_size {
                self.stage
                    .copy_from_slice(&self.pre_buffer[..self.chunk_size]);
                self.pre_buffer.drain(..self.chunk_size);
                let (_, generated) = resampler
                    .process_into_buffer(
                        &[self.stage.as_ref()],
                        std::slice::from_mut(&mut self.resample_scratch),
                        None,
                    )
                    .expect("Resampler failed");
                self.post_buffer
                    .extend_from_slice(&self.resample_scratch[..generated]);
            }
        } else {
            self.post_buffer.append(&mut self.pre_buffer);
        }

        // 3. Chunk into 512-sample frames of i16 (matches Silero VAD chunk_size)
        while self.post_buffer.len() >= SAMPLES_PER_FRAME {
            let chunk_f32: Vec<f32> = self.post_buffer.drain(0..SAMPLES_PER_FRAME).collect();

            let mut pcm_samples = Vec::with_capacity(SAMPLES_PER_FRAME);
            for &sample in &chunk_f32 {
                let s = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                pcm_samples.push(s);
            }
            frames_out.push(pcm_samples);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_no_resample_mono() {
        let mut processor = AudioProcessor::new(16000, 1);
        let samples = vec![0.5; 1024]; // 2 frames worth
        let chunks = processor.process(&samples);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), SAMPLES_PER_FRAME); // 512 samples
    }

    #[test]
    fn test_process_downmix_stereo() {
        let mut processor = AudioProcessor::new(16000, 2);
        let mut samples = Vec::new();
        for _ in 0..1024 {
            samples.push(0.5); // L
            samples.push(0.5); // R
        }
        let chunks = processor.process(&samples);
        assert_eq!(chunks.len(), 2);
    }

    #[test]
    fn test_process_resample() {
        let mut processor = AudioProcessor::new(48000, 1);
        let samples = vec![0.0; 48000]; // 1 second of audio
        let chunks = processor.process(&samples);
        // 48000 input -> 16000 output = 16000 samples/sec
        // Each output frame = 512 samples
        // 16000 / 512 ≈ 31.25 frames per second
        assert!(chunks.len() >= 30 && chunks.len() <= 33);
    }
}
