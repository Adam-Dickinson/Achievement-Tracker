use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;

use crate::error::ProviderError;
use crate::model::{
    AccountCredentials, AccountInfo, RemoteGame, RemoteGameAchievements, RemoteGameRef, Secret,
};
use crate::Platform;

/// What the UI and sync engine may assume about a provider.
#[derive(Debug, Clone, Copy, Default)]
pub struct Capabilities {
    /// Can push change notifications from local files (no polling needed).
    pub local_watch: bool,
    /// Must be polled on a schedule.
    pub polling: bool,
    /// Supplies global rarity percentages.
    pub global_rarity: bool,
    /// Sign-in happens through an OAuth-style web flow.
    pub oauth: bool,
    /// Relies on unofficial endpoints; must be opt-in and labelled.
    pub unofficial: bool,
}

/// User-supplied input for connecting an account.
#[derive(Debug)]
pub enum AuthInput {
    ApiKey { key: Secret, account_id: String },
    Token(Secret),
    OAuthCallback { redirect_url: String },
    LocalPath(PathBuf),
}

/// Called by a provider's watcher when local data changed for a game. The sync
/// engine re-fetches and diffs; watchers never emit unlocks themselves.
pub type ChangeCallback = Arc<dyn Fn(RemoteGameRef) + Send + Sync>;

/// Dropping the handle stops the watcher.
pub struct WatchHandle(#[allow(dead_code)] pub Box<dyn Send + Sync>);

/// A platform adapter. Pure: no SQL, no notifications, no UI (docs/ARCHITECTURE.md §2).
#[async_trait]
pub trait AchievementProvider: Send + Sync {
    fn platform(&self) -> Platform;
    fn capabilities(&self) -> Capabilities;

    async fn authenticate(&self, input: AuthInput) -> Result<AccountCredentials, ProviderError>;

    /// Check the credentials are still valid and return the account identity.
    async fn validate(&self, creds: &AccountCredentials) -> Result<AccountInfo, ProviderError>;

    /// All games with achievement data for this account.
    async fn list_games(
        &self,
        creds: &AccountCredentials,
    ) -> Result<Vec<RemoteGame>, ProviderError>;

    /// Full schema and unlock state for one game.
    async fn fetch_game(
        &self,
        creds: &AccountCredentials,
        game: &RemoteGameRef,
    ) -> Result<RemoteGameAchievements, ProviderError>;

    /// Event-driven sources return a handle; polled sources keep the default.
    fn watch(
        &self,
        _creds: &AccountCredentials,
        _on_change: ChangeCallback,
    ) -> Option<WatchHandle> {
        None
    }
}
