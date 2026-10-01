use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

/// Single-producer / single-consumer ring of `f32` samples (P4.2).
///
/// The cpal audio callback is the sole producer, the capture worker thread
/// the sole consumer. The callback path performs only `memcpy` + atomics:
/// no allocation, no locks, no syscalls, no clock reads.
///
/// On overflow the **newest** samples are dropped (and counted) — the worker
/// keeps draining, so a transient stall costs a dropout, never growing
/// latency. `UnsafeCell` sharing is sound because the producer range
/// `[write, write+n)` and the consumer range `[read, read+m)` are disjoint
/// by the `write - read <= capacity` invariant, synchronized with
/// Release/Acquire ordering.
pub struct SpscRing {
    buf: UnsafeCell<Box<[f32]>>,
    mask: usize,
    capacity: usize,
    write_pos: AtomicUsize,
    read_pos: AtomicUsize,
    dropped: AtomicU64,
}

// SAFETY: see struct docs — producer and consumer touch disjoint slots.
unsafe impl Sync for SpscRing {}

impl SpscRing {
    /// Capacity is rounded up to a power of two (mask indexing).
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.next_power_of_two().max(1024);
        Self {
            buf: UnsafeCell::new(vec![0.0; capacity].into_boxed_slice()),
            mask: capacity - 1,
            capacity,
            write_pos: AtomicUsize::new(0),
            read_pos: AtomicUsize::new(0),
            dropped: AtomicU64::new(0),
        }
    }

    pub fn len(&self) -> usize {
        let w = self.write_pos.load(Ordering::Acquire);
        let r = self.read_pos.load(Ordering::Acquire);
        w.saturating_sub(r).min(self.capacity)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Samples dropped (newest) due to overflow, cumulative.
    pub fn dropped(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }

    /// Copy `data` into the ring. Returns the number of samples accepted;
    /// the remainder (newest) is dropped and counted.
    pub fn push(&self, data: &[f32]) -> usize {
        if data.is_empty() {
            return 0;
        }
        let w = self.write_pos.load(Ordering::Relaxed);
        let r = self.read_pos.load(Ordering::Acquire);
        let free = self.capacity.saturating_sub(w.saturating_sub(r));
        let n = data.len().min(free);
        if n < data.len() {
            self.dropped
                .fetch_add((data.len() - n) as u64, Ordering::Relaxed);
        }
        if n == 0 {
            return 0;
        }
        // SAFETY: producer-exclusive range; consumer cannot be inside it.
        let buf = unsafe { &mut *self.buf.get() };
        let start = w & self.mask;
        let first = (self.capacity - start).min(n);
        buf[start..start + first].copy_from_slice(&data[..first]);
        if first < n {
            let rest = n - first;
            buf[..rest].copy_from_slice(&data[first..first + rest]);
        }
        self.write_pos.store(w.wrapping_add(n), Ordering::Release);
        n
    }

    /// Drain up to `out.len()` samples. Returns the number actually read.
    pub fn pop(&self, out: &mut [f32]) -> usize {
        if out.is_empty() {
            return 0;
        }
        let r = self.read_pos.load(Ordering::Relaxed);
        let w = self.write_pos.load(Ordering::Acquire);
        let available = w.saturating_sub(r).min(self.capacity);
        let n = out.len().min(available);
        if n == 0 {
            return 0;
        }
        // SAFETY: consumer-exclusive range; producer cannot be inside it.
        let buf = unsafe { &*self.buf.get() };
        let start = r & self.mask;
        let first = (self.capacity - start).min(n);
        out[..first].copy_from_slice(&buf[start..start + first]);
        if first < n {
            let rest = n - first;
            out[first..first + rest].copy_from_slice(&buf[..rest]);
        }
        self.read_pos.store(r.wrapping_add(n), Ordering::Release);
        n
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_pop_round_trip() {
        let ring = SpscRing::new(1024);
        let input: Vec<f32> = (0..100).map(|i| i as f32).collect();
        assert_eq!(ring.push(&input), 100);
        let mut out = vec![0.0; 100];
        assert_eq!(ring.pop(&mut out), 100);
        assert_eq!(out, input);
        assert!(ring.is_empty());
    }

    #[test]
    fn wraparound_preserves_order() {
        let ring = SpscRing::new(1024);
        // Fill more than capacity in two pushes to force wrap + overflow.
        let first: Vec<f32> = (0..900).map(|i| i as f32).collect();
        assert_eq!(ring.push(&first), 900);
        let mut drain = vec![0.0; 500];
        assert_eq!(ring.pop(&mut drain), 500);
        let second: Vec<f32> = (900..1600).map(|i| i as f32).collect();
        // 400 buffered + 700 new = 1100 > 1024 → 76 newest dropped.
        assert_eq!(ring.push(&second), 624);
        assert_eq!(ring.dropped(), 76);
        let mut rest = vec![0.0; 1024];
        let n = ring.pop(&mut rest);
        assert_eq!(n, 1024);
        // Oldest surviving sample is input[500], newest is input[1523].
        assert_eq!(rest[0], 500.0);
        assert_eq!(rest[n - 1], 900.0 + 623.0);
        assert!(ring.is_empty());
    }

    #[test]
    fn empty_pop_reads_nothing() {
        let ring = SpscRing::new(1024);
        let mut out = vec![0.0; 64];
        assert_eq!(ring.pop(&mut out), 0);
        assert_eq!(ring.push(&[]), 0);
    }

    #[test]
    fn spsc_thread_smoke() {
        let ring = std::sync::Arc::new(SpscRing::new(8192));
        let producer = ring.clone();
        let handle = std::thread::spawn(move || {
            let mut received = 0usize;
            let mut expected = 0.0f32;
            let mut buf = vec![0.0; 512];
            while received < 4096 {
                let n = producer.pop(&mut buf);
                for &v in &buf[..n] {
                    assert_eq!(v, expected);
                    expected += 1.0;
                }
                received += n;
                if n == 0 {
                    std::thread::yield_now();
                }
            }
        });
        let mut sent = 0.0f32;
        let mut chunk = vec![0.0; 300];
        while sent < 4096.0 {
            for v in chunk.iter_mut() {
                *v = sent;
                sent += 1.0;
            }
            assert_eq!(ring.push(&chunk), 300);
        }
        handle.join().unwrap();
        assert_eq!(ring.dropped(), 0);
    }
}
