use std::collections::HashMap;
use std::sync::Mutex;

use crate::model::Secret;

/// Where tokens and API keys live. Production uses the OS keychain (the
/// `keyring` crate, added in M1); tests use [`InMemorySecretStore`].
/// Secrets must never be written to SQLite, config files, logs or the frontend.
pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<Secret>, String>;
    fn set(&self, key: &str, value: Secret) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<(), String>;
}

#[derive(Default)]
pub struct InMemorySecretStore {
    inner: Mutex<HashMap<String, Secret>>,
}

impl SecretStore for InMemorySecretStore {
    fn get(&self, key: &str) -> Result<Option<Secret>, String> {
        let map = self.inner.lock().map_err(|e| e.to_string())?;
        Ok(map.get(key).cloned())
    }

    fn set(&self, key: &str, value: Secret) -> Result<(), String> {
        let mut map = self.inner.lock().map_err(|e| e.to_string())?;
        map.insert(key.to_owned(), value);
        Ok(())
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        let mut map = self.inner.lock().map_err(|e| e.to_string())?;
        map.remove(key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let store = InMemorySecretStore::default();
        assert!(store.get("a").unwrap().is_none());
        store.set("a", Secret::new("v")).unwrap();
        assert_eq!(store.get("a").unwrap().unwrap().expose(), "v");
        store.delete("a").unwrap();
        assert!(store.get("a").unwrap().is_none());
    }
}
