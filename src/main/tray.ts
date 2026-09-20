import { Menu, nativeImage, Tray } from 'electron'
import appIcon from '../../resources/icon.png?asset'

interface TrayActions {
  open(): void
  sendTestNotification(): void
  quit(): void
}

/** The tray icon keeps the app reachable while the main window is hidden. */
export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(nativeImage.createFromPath(appIcon).resize({ width: 16, height: 16 }))
  tray.setToolTip('Achievement Tracker')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Achievement Tracker', click: actions.open },
      { label: 'Send test notification', click: actions.sendTestNotification },
      { type: 'separator' },
      { label: 'Quit', click: actions.quit },
    ]),
  )
  tray.on('click', actions.open)
  return tray
}
