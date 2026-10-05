import type { Platform } from '@shared/platform'

export type LaunchTarget =
  | { readonly kind: 'uri'; readonly uri: string }
  | { readonly kind: 'program'; readonly exe: string; readonly args: readonly string[] }

export interface InstalledGame {
  readonly platform: Platform
  readonly externalId: string
  readonly title: string
  readonly target: LaunchTarget
}

export interface InstallAdapter {
  readonly platform: Platform
  findInstalled(): Promise<readonly InstalledGame[]>
}
