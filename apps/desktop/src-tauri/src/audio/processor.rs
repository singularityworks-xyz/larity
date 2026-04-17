use byteorder::{LittleEndian, WriteBytesExt};
use rubato::{FastFixedIn, PolynomialDegree, Resampler};

const TARGET_SAMPLE_RATE: usize = 16000;
const FRAME_DURATION_MS: usize = 50;
const SAMPLES_PER_FRAME: usize = (TARGET_SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 800

pub struct AudioProcessor {
    resampler: Option<FastFixedIn<f32>>,
    _input_sample_rate: usize,
    channels: usize,
    pre_buffer: Vec<f32>,
    post_buffer: Vec<f32>,
    chunk_size: usize,
}

impl AudioProcessor {
    pub fn new(input_sample_rate: usize, channels: usize) -> Self {
        let chunk_size = 1024; // Fixed input chunk size for the resampler
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

        Self {
            resampler,
            _input_sample_rate: input_sample_rate,
            channels,
            pre_buffer: Vec::new(),
            post_buffer: Vec::new(),
            chunk_size,
        }
    }

    pub fn process(&mut self, interleaved_samples: &[f32]) -> Vec<Vec<u8>> {
        // 1. Downmix to Mono
        for chunk in interleaved_samples.chunks(self.channels) {
            let sum: f32 = chunk.iter().sum();
            self.pre_buffer.push(sum / self.channels as f32);
        }

        // 2. Resample
        if let Some(resampler) = &mut self.resampler {
            while self.pre_buffer.len() >= self.chunk_size {
                let chunk: Vec<f32> = self.pre_buffer.drain(0..self.chunk_size).collect();
                let input = vec![chunk];
                let mut output = resampler.process(&input, None).expect("Resampler failed");
                self.post_buffer.append(&mut output[0]);
            }
        } else {
            self.post_buffer.append(&mut self.pre_buffer);
        }

        // 3. Chunk into 50ms (800 samples) frames of i16 bytes
        let mut chunks = Vec::new();
        while self.post_buffer.len() >= SAMPLES_PER_FRAME {
            let chunk_f32: Vec<f32> = self.post_buffer.drain(0..SAMPLES_PER_FRAME).collect();

            let mut pcm_bytes = Vec::with_capacity(SAMPLES_PER_FRAME * 2);
            for &sample in &chunk_f32 {
                let s = (sample.max(-1.0).min(1.0) * i16::MAX as f32) as i16;
                pcm_bytes.write_i16::<LittleEndian>(s).unwrap();
            }
            chunks.push(pcm_bytes);
        }

        chunks
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_no_resample_mono() {
        let mut processor = AudioProcessor::new(16000, 1);
        let samples = vec![0.5; 1600]; // 100ms
        let chunks = processor.process(&samples);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), SAMPLES_PER_FRAME * 2); // 800 samples * 2 bytes = 1600 bytes
    }

    #[test]
    fn test_process_downmix_stereo() {
        let mut processor = AudioProcessor::new(16000, 2);
        let mut samples = Vec::new();
        for _ in 0..1600 {
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
        // It processes in chunk_size (1024), 48000 / 1024 = 46.8 chunks -> 46 full chunks
        // output rate is 1/3, each chunk produces 1024 / 3 ≈ 341 samples
        // 46 * 341 = 15686 samples
        // Should yield roughly 15686 / 800 ≈ 19 chunks (50ms frames of 16kHz)
        // 1 sec of 16kHz is 20 chunks. With leftover, 19 chunks should definitely be ready.
        assert!(chunks.len() >= 18 && chunks.len() <= 20);
    }
}
