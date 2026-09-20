---
name: write-adr
description: Use when making or recording a significant architectural or technology decision for Achievement Tracker (new dependency category, changing sync/notification design, storage, auth approach, dropping a provider).
---

# Write an Architecture Decision Record

ADRs live in `docs/adr/NNNN-short-title.md`, numbered sequentially (next number = highest existing + 1). See `0002-csharp-dotnet-avalonia.md` for the house style.

## When to write one
- Choosing/replacing a framework, database, or core NuGet package
- Changing how sync, notifications, auth or secrets work
- Adding or dropping a platform for reasons beyond routine implementation
- Anything a future contributor would otherwise ask "why did we do it this way?"

Skip for routine feature work, bug fixes and refactors within existing decisions.

## Template

```markdown
# ADR-NNNN: <title>

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD

## Context
What forces and constraints make this a decision? Link the relevant SPEC/DESIGN sections.

## Options considered
Table or list; be fair to the losers.

## Decision
What we chose, in one or two sentences, then the reasoning.

## Consequences
Positive, negative, and what we now have to do or accept.

## Revisit if
Concrete conditions that would reopen this.
```

## Steps
1. Draft with status **Proposed**; discuss; set **Accepted** once agreed.
2. If it supersedes an older ADR, update the old one's status to `Superseded by ADR-NNNN`. Never delete old ADRs.
3. Update any affected docs (SPEC/ARCHITECTURE/CLAUDE.md) in the same change.
