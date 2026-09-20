use serde::{Deserialize, Serialize};

/// Every source achievements can come from. Keep in sync with docs/SPEC.md §3.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Steam,
    Xbox,
    Playstation,
    Epic,
    Ubisoft,
    Ea,
    Retroachievements,
    Rpcs3,
    Xenia,
    LocalFile,
}

impl Platform {
    pub const ALL: [Platform; 10] = [
        Platform::Steam,
        Platform::Xbox,
        Platform::Playstation,
        Platform::Epic,
        Platform::Ubisoft,
        Platform::Ea,
        Platform::Retroachievements,
        Platform::Rpcs3,
        Platform::Xenia,
        Platform::LocalFile,
    ];

    /// Stable identifier used in the database and IPC.
    pub fn as_str(self) -> &'static str {
        match self {
            Platform::Steam => "steam",
            Platform::Xbox => "xbox",
            Platform::Playstation => "playstation",
            Platform::Epic => "epic",
            Platform::Ubisoft => "ubisoft",
            Platform::Ea => "ea",
            Platform::Retroachievements => "retroachievements",
            Platform::Rpcs3 => "rpcs3",
            Platform::Xenia => "xenia",
            Platform::LocalFile => "local_file",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Platform::Steam => "Steam",
            Platform::Xbox => "Xbox",
            Platform::Playstation => "PlayStation",
            Platform::Epic => "Epic Games",
            Platform::Ubisoft => "Ubisoft Connect",
            Platform::Ea => "EA app",
            Platform::Retroachievements => "RetroAchievements",
            Platform::Rpcs3 => "RPCS3",
            Platform::Xenia => "Xenia",
            Platform::LocalFile => "Local file",
        }
    }

    /// Unofficial integrations are opt-in and labelled in the UI (docs/PROVIDERS.md).
    pub fn is_unofficial(self) -> bool {
        matches!(
            self,
            Platform::Xbox
                | Platform::Playstation
                | Platform::Epic
                | Platform::Ubisoft
                | Platform::Ea
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_str_is_unique() {
        let mut seen = std::collections::HashSet::new();
        for p in Platform::ALL {
            assert!(seen.insert(p.as_str()), "duplicate id {}", p.as_str());
        }
    }

    #[test]
    fn official_apis_are_not_flagged_unofficial() {
        assert!(!Platform::Steam.is_unofficial());
        assert!(!Platform::Retroachievements.is_unofficial());
        assert!(Platform::Playstation.is_unofficial());
    }
}
