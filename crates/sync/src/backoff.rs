use std::time::Duration;

/// Exponential backoff: `base * 2^attempt`, capped at `max`. Callers add jitter.
pub fn backoff_delay(attempt: u32, base: Duration, max: Duration) -> Duration {
    let factor = 2u32.saturating_pow(attempt.min(16));
    base.saturating_mul(factor).min(max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grows_exponentially_then_caps() {
        let base = Duration::from_secs(5);
        let max = Duration::from_secs(300);
        assert_eq!(backoff_delay(0, base, max), Duration::from_secs(5));
        assert_eq!(backoff_delay(1, base, max), Duration::from_secs(10));
        assert_eq!(backoff_delay(3, base, max), Duration::from_secs(40));
        assert_eq!(backoff_delay(20, base, max), max);
    }
}
