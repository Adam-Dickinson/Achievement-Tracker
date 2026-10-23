import type { ToastPayload } from '@shared/ipc'
import { RARITY_LABEL } from '@shared/rarity'

export interface NativeToastText {
  readonly title: string
  readonly body: string
}

export interface NativeNotification {
  on(event: 'click' | 'close', listener: () => void): void
  show(): void
}

export interface NativeToasterDeps {
  readonly supported: () => boolean
  readonly create: (options: NativeToastText & { readonly silent: boolean }) => NativeNotification
  readonly silent: () => boolean
  readonly onClick: () => void
}

export function nativeToastText(toast: ToastPayload): NativeToastText {
  const details = [
    toast.game,
    toast.platinum ? 'Platinum' : RARITY_LABEL[toast.rarity],
    toast.percent === null ? null : `${toast.percent}%`,
  ].filter((part) => part !== null)
  return { title: toast.heading, body: `${toast.title}\n${details.join(' · ')}` }
}

export function createNativeToaster(deps: NativeToasterDeps): (toast: ToastPayload) => void {
  const live = new Set<NativeNotification>()
  return (toast) => {
    if (!deps.supported()) return
    const notification = deps.create({ ...nativeToastText(toast), silent: deps.silent() })
    live.add(notification)
    notification.on('click', () => {
      live.delete(notification)
      deps.onClick()
    })
    notification.on('close', () => live.delete(notification))
    notification.show()
  }
}
