//! Normalized DTOs returned by providers. Providers know nothing about SQLite.

use std::fmt;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::Platform;

/// Rarity tier derived from the global unlock percentage (docs/DESIGN.md §6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Rarity {
    Common,
    Uncommon,
    Rare,
    UltraRare,
}

impl Rarity {
    /// `percent` is the share of players (0-100) who unlocked the achievement.
    pub fn from_percent(percent: f32) -> Rarity {
        if percent < 2.0 {
            Rarity::UltraRare
        } else if percent < 10.0 {
            Rarity::Rare
        } else if percent <= 30.0 {
            Rarity::Uncommon
        } else {
            Rarity::Common
        }
    }
}

/// A secret (token / API key). Debug output is redacted so it can't leak into logs.
#[derive(Clone, Serialize, Deserialize)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Secret(value.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(<redacted>)")
    }
}

/// What a provider needs to talk to the platform for one account.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountCredentials {
    pub platform: Platform,
    /// Platform-side account identifier (steamid64, xuid, RA username, ...).
    pub external_id: String,
    pub secret: Option<Secret>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub external_id: String,
    pub display_name: String,
}

/// A game as reported by a platform.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RemoteGameRef {
    /// appid, titleId, NPWR id, RA game id, ...
    pub external_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteGame {
    pub reference: RemoteGameRef,
    pub title: String,
    pub icon_url: Option<String>,
    pub last_played: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteAchievement {
    pub external_id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub icon_locked_url: Option<String>,
    pub hidden: bool,
    /// Gamerscore / RA points, when the platform has them.
    pub points: Option<u32>,
    /// Trophy grade (bronze..platinum), when applicable.
    pub tier: Option<String>,
    /// Global unlock percentage 0-100, when known.
    pub global_percent: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteUnlock {
    pub achievement_external_id: String,
    /// As reported by the platform; may be absent.
    pub unlocked_at: Option<DateTime<Utc>>,
    pub progress: Option<(u32, u32)>,
}

/// Full schema plus the account's unlock state for one game.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteGameAchievements {
    pub achievements: Vec<RemoteAchievement>,
    pub unlocks: Vec<RemoteUnlock>,
}

/// Emitted by the sync engine after a new unlock is committed to the store.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlockEvent {
    pub platform: Platform,
    pub game_title: String,
    pub achievement: RemoteAchievement,
    pub detected_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rarity_thresholds() {
        assert_eq!(Rarity::from_percent(1.4), Rarity::UltraRare);
        assert_eq!(Rarity::from_percent(2.0), Rarity::Rare);
        assert_eq!(Rarity::from_percent(9.99), Rarity::Rare);
        assert_eq!(Rarity::from_percent(10.0), Rarity::Uncommon);
        assert_eq!(Rarity::from_percent(30.0), Rarity::Uncommon);
        assert_eq!(Rarity::from_percent(42.0), Rarity::Common);
    }

    #[test]
    fn secret_debug_is_redacted() {
        let s = Secret::new("super-secret-token");
        assert!(!format!("{s:?}").contains("super-secret-token"));
    }
}
