import { randomUUID } from 'node:crypto'
import { BrowserWindow, session } from 'electron'
import { type SignInWindow, UBISOFT_SESSIONS_URL } from './ubisoft-sign-in'

const PROTOCOL_VERSION = '1.3'
const OK = 200

interface PendingRequest {
  readonly sessionId: string | undefined
  status: number
}

export function openUbisoftSignInWindow(url: string, parent?: BrowserWindow): SignInWindow {
  const partition = session.fromPartition(`ubisoft-sign-in-${randomUUID()}`, { cache: false })
  partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))

  const window = new BrowserWindow({
    parent,
    width: 520,
    height: 760,
    title: 'Sign in to Ubisoft',
    autoHideMenuBar: true,
    webPreferences: {
      session: partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const contents = window.webContents
  contents.setUserAgent(chromeUserAgent(contents.getUserAgent()))

  const replyListeners: ((body: string) => void)[] = []
  const closedListeners: (() => void)[] = []
  const pending = new Map<string, PendingRequest>()
  const debug = contents.debugger
  debug.attach(PROTOCOL_VERSION)

  debug.on('message', (_event, method, params, sessionId) => {
    const key = (requestId: string): string => `${sessionId ?? ''}:${requestId}`
    if (method === 'Target.attachedToTarget') {
      void watchNetwork(debug, params.sessionId)
    } else if (method === 'Network.requestWillBeSent') {
      if (params.request.url === UBISOFT_SESSIONS_URL && params.request.method === 'POST') {
        pending.set(key(params.requestId), { sessionId: sessionId || undefined, status: 0 })
      }
    } else if (method === 'Network.responseReceived') {
      const request = pending.get(key(params.requestId))
      if (request) request.status = params.response.status
    } else if (method === 'Network.loadingFinished') {
      const request = pending.get(key(params.requestId))
      pending.delete(key(params.requestId))
      if (request?.status === OK) {
        void readBody(debug, params.requestId, request.sessionId).then((body) => {
          if (body !== null) for (const listener of replyListeners) listener(body)
        })
      }
    }
  })

  window.on('closed', () => {
    for (const listener of closedListeners) listener()
  })
  void contents.loadURL(url).catch(() => undefined)
  void watchNetwork(debug)

  return {
    onSessionReply: (listener) => replyListeners.push(listener),
    onClosed: (listener) => closedListeners.push(listener),
    close: () => {
      if (!window.isDestroyed()) window.destroy()
    },
  }
}

async function watchNetwork(debug: Electron.Debugger, sessionId?: string): Promise<void> {
  try {
    await send(debug, 'Network.enable', {}, sessionId)
    await send(
      debug,
      'Target.setAutoAttach',
      { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
      sessionId,
    )
  } catch {
    return
  }
}

async function readBody(
  debug: Electron.Debugger,
  requestId: string,
  sessionId: string | undefined,
): Promise<string | null> {
  try {
    const reply = (await send(debug, 'Network.getResponseBody', { requestId }, sessionId)) as {
      body: string
      base64Encoded: boolean
    }
    return reply.base64Encoded ? Buffer.from(reply.body, 'base64').toString('utf8') : reply.body
  } catch {
    return null
  }
}

function send(
  debug: Electron.Debugger,
  method: string,
  params: Record<string, unknown>,
  sessionId: string | undefined,
): Promise<unknown> {
  return sessionId
    ? debug.sendCommand(method, params, sessionId)
    : debug.sendCommand(method, params)
}

function chromeUserAgent(userAgent: string): string {
  return userAgent.replace(/ Electron\/\S+/, '').replace(/ [\w-]+\/[\d.]+(?= Chrome)/, '')
}
