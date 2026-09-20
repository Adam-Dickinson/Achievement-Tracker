use std::time::Duration;

/// Typed provider failures. The sync engine maps these to backoff, re-auth
/// prompts or UI status (docs/SPEC.md §4). Never put secrets in messages.
#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("authentication expired or invalid")]
    AuthExpired,

    #[error("rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Option<Duration> },

    #[error("network error: {0}")]
    Network(String),

    #[error("could not parse provider data: {0}")]
    Parse(String),

    #[error("not supported: {0}")]
    Unsupported(String),

    #[error("{0}")]
    Other(String),
}

impl ProviderError {
    /// Whether retrying later (with backoff) can plausibly succeed.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            ProviderError::RateLimited { .. } | ProviderError::Network(_)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retryable_classification() {
        assert!(ProviderError::Network("x".into()).is_retryable());
        assert!(ProviderError::RateLimited { retry_after: None }.is_retryable());
        assert!(!ProviderError::AuthExpired.is_retryable());
        assert!(!ProviderError::Parse("x".into()).is_retryable());
    }
}
