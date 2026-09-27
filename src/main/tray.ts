import { Menu, nativeImage, Tray } from 'electron'
import trayIcon from '../../resources/tray.png?asset'
import { trayMenuTemplate, type TrayActions } from './tray-menu'

export interface AppTray {
  refresh(): void
}

export function createTray(actions: TrayActions): AppTray {
  const tray = new Tray(nativeImage.createFromPath(trayIcon))
  const refresh = (): void => {
    tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate(actions)))
  }
  tray.setToolTip('Trophy Locker')
  refresh()
  tray.on('click', () => actions.open())
  return { refresh }
}
