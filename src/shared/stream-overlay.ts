import { z } from 'zod'
import { TOAST_CORNERS, type OverlayFrame } from './ipc'
import { PLATFORMS } from './platform'
import { RARITIES } from './rarity'

const visibleToastSchema = z.object({
  id: z.number().int(),
  heading: z.string(),
  rarity: z.enum(RARITIES),
  title: z.string(),
  description: z.string().nullable(),
  game: z.string(),
  platform: z.enum(PLATFORMS).nullable(),
  percent: z.number().nullable(),
  platinum: z.boolean(),
})

const overlayFrameSchema = z.object({
  toasts: z.array(visibleToastSchema),
  corner: z.enum(TOAST_CORNERS),
  scale: z.number().positive(),
  sound: z.object({ enabled: z.boolean(), volume: z.number().min(0).max(1) }),
})

export function parseOverlayFrame(text: string): OverlayFrame | null {
  try {
    const parsed = overlayFrameSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
