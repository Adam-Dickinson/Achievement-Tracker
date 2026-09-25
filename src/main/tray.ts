import { Menu, nativeImage, Tray } from 'electron'
import trayIcon from '../../resources/tray.png?asset'
import { trayMenuTemplate, type TrayActions } from './tray-menu'

export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(nativeImage.createFromPath(trayIcon))
  tray.setToolTip('Trophy Locker')
  tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate(actions)))
  tray.on('click', () => actions.open())
  return tray
}
