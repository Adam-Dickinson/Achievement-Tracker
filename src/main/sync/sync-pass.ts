import type { DatabaseSync } from 'node:sqlite'
import type { AccountCredentials, RemoteAchievement, UnlockEvent } from '@shared/models'
import type { AchievementProvider } from '@shared/provider'
import {
  type AccountRow,
  getPlatformGameByExternalId,
  insertNewUnlocks,
  setBaselineDone,
  upsertAchievements,
} from '../store/sync-store'

export async function runSyncPass(
  db: DatabaseSync,
  account: AccountRow,
  externalGameId: string,
  provider: AchievementProvider,
  credentials: AccountCredentials,
  signal?: AbortSignal,
): Promise<UnlockEvent[]> {
  const platformGame = getPlatformGameByExternalId(db, account.id, externalGameId)

  const remote = await provider.fetchGame(credentials, { externalId: externalGameId }, signal)

  db.exec('BEGIN')
  try {
    upsertAchievements(db, platformGame.id, remote.achievements)
    const newUnlocks = insertNewUnlocks(db, platformGame.id, remote.unlocks)

    // Baseline rule (SPEC F-16): a first sync announces only unlocks dated after the cutoff.
    const { baselineDone, baselineCutoff: cutoff } = platformGame
    const announced = baselineDone
      ? newUnlocks
      : newUnlocks.filter((unlock) => cutoff && unlock.unlockedAt && unlock.unlockedAt > cutoff)
    const detectedAt = new Date()
    const events = announced.map((unlock) =>
      toUnlockEvent(
        findAchievement(remote.achievements, unlock.achievementExternalId),
        account,
        platformGame.title,
        detectedAt,
      ),
    )

    if (!platformGame.baselineDone) setBaselineDone(db, platformGame.id)

    db.exec('COMMIT')
    return events
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function findAchievement(
  achievements: readonly RemoteAchievement[],
  externalId: string,
): RemoteAchievement {
  const achievement = achievements.find((a) => a.externalId === externalId)
  if (!achievement) throw new Error(`No achievement ${externalId} in the fetched schema`)
  return achievement
}

function toUnlockEvent(
  achievement: RemoteAchievement,
  account: AccountRow,
  gameTitle: string,
  detectedAt: Date,
): UnlockEvent {
  return { platform: account.platform, gameTitle, achievement, detectedAt }
}
