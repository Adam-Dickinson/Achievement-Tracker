# ADR-0008: Epic, Ubisoft and EA come before PlayStation

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

[ADR-0006](0006-v1-provider-scope.md) set the v1 order: M3 was PlayStation and the unified library, and M4 was Epic, Ubisoft and EA, each starting with a feasibility spike (Spike C) that ends in either a provider or a documented "not supported".

With M2's code done (near real-time Steam, the Xbox provider and the Activity screen), the owner asked for Epic, Ubisoft and EA next instead of PlayStation. They play on those stores more than they need PlayStation right now.

Nothing technical makes PlayStation go first. Cross-platform game linking already has Steam and Xbox to match against, and a store game that is also on Steam is a good case for linking too.

## Options considered

| Option | Result |
|---|---|
| Keep ADR-0006's order | PlayStation and the unified library first; the stores the owner wants wait a milestone |
| Only move the store spike earlier, and build the providers after PlayStation | Answers the "can we?" question sooner, but the providers still wait |
| **Swap M3 and M4 whole** | Spike C and the Epic, Ubisoft and EA providers first, then PlayStation, linking, dashboard stats and search |

## Decision

Swap the two milestones. **M3 is Epic, Ubisoft and EA** (Spike C first, then a provider or a documented "not supported" for each). **M4 is PlayStation and the unified library.** Everything else in ADR-0006 stands: the v1 scope, the emulators after v1, and rule 5.

The priorities in SPEC stay as they are (F-04 Steam, Xbox and PlayStation P0; F-05 Epic, Ubisoft and EA P1, subject to their spikes). The build order no longer follows the priority, and that is deliberate: P1 means the stores may end as "not supported", not that they must be built last.

## Consequences

**Positive:**

- The owner's stores are looked at first, and Spike C's verdicts come a milestone sooner, so v1's real platform list is known earlier.
- Game linking arrives with up to five sources to match instead of three.

**Negative / to accept:**

- PlayStation, a P0 platform, waits a milestone. v1 is not "P0 complete" until M4.
- If Spike C finds all three stores infeasible, M3 ends with only documentation. That is an accepted result, as in ADR-0006.

**To do now:** swap the M3 and M4 sections in ROADMAP.md, and update the milestone references in PROVIDERS.md and PROJECT-MAP.md.

## Revisit if

- Spike C finds all three stores infeasible early: move straight on to PlayStation.
- The owner needs PlayStation sooner.
