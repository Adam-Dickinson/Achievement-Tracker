import { Menu, nativeImage, Tray } from 'electron'
import appIcon from '../../resources/icon.png?asset'
import { trayMenuTemplate, type TrayActions } from './tray-menu'

export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(nativeImage.createFromPath(appIcon).resize({ width: 16, height: 16 }))
  tray.setToolTip('Achievement Tracker')
  tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate(actions)))
  tray.on('click', () => actions.open())
  return tray
}
