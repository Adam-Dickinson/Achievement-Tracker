//! SQLite persistence. SQL lives only in this crate (docs/ARCHITECTURE.md §2).
//!
//! Migrations are forward-only files in `migrations/`; see the `db-migration`
//! skill before changing the schema.

/// `(name, sql)` for every migration, in order. Replaced by `sqlx::migrate!`
/// when the pool is wired up in M1.
pub const MIGRATIONS: &[(&str, &str)] =
    &[("0001_init", include_str!("../migrations/0001_init.sql"))];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_named_sequentially_and_non_empty() {
        for (i, (name, sql)) in MIGRATIONS.iter().enumerate() {
            assert!(
                name.starts_with(&format!("{:04}_", i + 1)),
                "bad name {name}"
            );
            assert!(!sql.trim().is_empty(), "{name} is empty");
        }
    }
}
