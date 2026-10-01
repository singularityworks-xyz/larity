use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Minimum milliseconds between amplitude emits (≈15 Hz, P4.4).
pub const AMPLITUDE_EMIT_INTERVAL_MS: u64 = 66;

/// Refcounted amplitude-listener registry (P4.4).
///
/// Two independent consumers toggle independently: the overlay visualizers
/// (`raw-mic-amplitude`) and `VadManager` (`vad-amplitude`, only when an
/// `onAmplitude` callback is registered). A plain bool would let one
/// consumer's release disable the other's stream, so acquire/release pair
/// per consumer instead. Emits happen only while the count is non-zero.
#[derive(Clone, Default)]
pub struct AmplitudeListeners {
    count: Arc<AtomicUsize>,
}

impl AmplitudeListeners {
    /// Register one listener. Returns the new count (for tests/logging).
    pub fn acquire(&self) -> usize {
        self.count.fetch_add(1, Ordering::AcqRel) + 1
    }

    /// Release one listener. Never goes below zero (unpaired releases from
    /// a best-effort JS `finally` are harmless).
    pub fn release(&self) -> usize {
        // `fetch_update` loops internally; contention here is negligible
        // (mount/unmount frequency, not audio frequency).
        self.count
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |c| {
                Some(c.saturating_sub(1))
            })
            .unwrap_or(0)
            .saturating_sub(1)
    }

    pub fn has_listeners(&self) -> bool {
        self.count.load(Ordering::Acquire) > 0
    }
}

/// True when an amplitude emit is due: a listener exists and the interval
/// has elapsed since `last_emit_ms`. Pure — unit-tested below; both the
/// capture worker and the VAD loop use it.
pub fn should_emit_amplitude(
    listeners: &AmplitudeListeners,
    last_emit_ms: u64,
    now_ms: u64,
) -> bool {
    listeners.has_listeners() && now_ms.saturating_sub(last_emit_ms) >= AMPLITUDE_EMIT_INTERVAL_MS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_listeners_never_emits() {
        let listeners = AmplitudeListeners::default();
        assert!(!should_emit_amplitude(&listeners, 0, u64::MAX / 2));
    }

    #[test]
    fn emits_only_after_interval() {
        let listeners = AmplitudeListeners::default();
        listeners.acquire();
        assert!(!should_emit_amplitude(&listeners, 1000, 1000 + 65));
        assert!(should_emit_amplitude(&listeners, 1000, 1000 + 66));
        assert!(should_emit_amplitude(&listeners, 1000, 1000 + 5000));
    }

    #[test]
    fn refcount_pairs_independently() {
        let listeners = AmplitudeListeners::default();
        listeners.acquire(); // overlay
        listeners.acquire(); // VadManager
        listeners.release(); // overlay unmounts
        assert!(listeners.has_listeners());
        // Unpaired extra releases never underflow.
        listeners.release();
        listeners.release();
        assert!(!listeners.has_listeners());
    }
}
