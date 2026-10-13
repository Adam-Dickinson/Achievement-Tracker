import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, resolve, sep } from 'node:path'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type OverlayFrame,
  type StreamOverlaySettings,
  type StreamOverlayStatus,
  type VisibleToast,
} from '@shared/ipc'

export const STREAM_PAGE = 'stream.html'
export const KEEP_ALIVE_MS = 15_000

const HOST = '127.0.0.1'
const OFF: StreamOverlayStatus = { state: 'off', url: null, message: null }

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

export interface StreamOverlayDeps {
  readonly rendererDir: string
  readonly devUrl?: string | undefined
  readonly onStatus?: (status: StreamOverlayStatus) => void
  readonly keepAliveMs?: number
}

export class StreamOverlayServer {
  readonly #rendererDir: string
  readonly #devUrl: string | undefined
  readonly #onStatus: (status: StreamOverlayStatus) => void
  readonly #keepAliveMs: number
  readonly #clients = new Set<ServerResponse>()
  #server: Server | null = null
  #requestedPort: number | null = null
  #port: number | null = null
  #keepAlive: NodeJS.Timeout | null = null
  #status: StreamOverlayStatus = OFF
  #queue: Promise<unknown> = Promise.resolve()
  #frame: OverlayFrame = {
    toasts: [],
    corner: 'top-left',
    scale: 1,
    sound: DEFAULT_NOTIFICATION_SETTINGS.stream.sound,
  }

  constructor(deps: StreamOverlayDeps) {
    this.#rendererDir = resolve(deps.rendererDir)
    this.#devUrl = deps.devUrl
    this.#onStatus = deps.onStatus ?? (() => undefined)
    this.#keepAliveMs = deps.keepAliveMs ?? KEEP_ALIVE_MS
  }

  get status(): StreamOverlayStatus {
    return this.#status
  }

  configure(settings: StreamOverlaySettings): Promise<StreamOverlayStatus> {
    this.#frame = { ...this.#frame, sound: settings.sound }
    return this.#serially(async () => {
      if (!settings.enabled) {
        await this.#close()
        this.#setStatus(OFF)
      } else if (!this.#server || this.#requestedPort !== settings.port) {
        await this.#close()
        await this.#listen(settings.port)
      }
      return this.#status
    })
  }

  publish(toasts: readonly VisibleToast[]): void {
    this.#frame = { ...this.#frame, toasts }
    const message = `data: ${JSON.stringify(this.#frame)}\n\n`
    for (const client of this.#clients) client.write(message)
  }

  stop(): Promise<void> {
    return this.#serially(async () => {
      await this.#close()
      this.#setStatus(OFF)
    })
  }

  #serially<T>(task: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(task, task)
    this.#queue = next.catch(() => undefined)
    return next
  }

  #listen(port: number): Promise<void> {
    this.#requestedPort = port
    const server = createServer((request, response) => this.#handle(request, response))
    return new Promise((done) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        this.#setStatus({
          state: 'error',
          url: null,
          message:
            error.code === 'EADDRINUSE'
              ? `Port ${port} is already in use by another program. Pick a different port.`
              : `The stream overlay couldn't start: ${error.message}`,
        })
        done()
      })
      server.listen(port, HOST, () => {
        this.#server = server
        this.#port = (server.address() as AddressInfo).port
        this.#keepAlive = setInterval(() => {
          for (const client of this.#clients) client.write(': keep-alive\n\n')
        }, this.#keepAliveMs)
        this.#keepAlive.unref()
        this.#setStatus({ state: 'running', url: `http://${HOST}:${this.#port}/`, message: null })
        done()
      })
    })
  }

  async #close(): Promise<void> {
    if (this.#keepAlive) clearInterval(this.#keepAlive)
    this.#keepAlive = null
    for (const client of this.#clients) client.end()
    this.#clients.clear()
    const server = this.#server
    this.#server = null
    this.#port = null
    this.#requestedPort = null
    if (!server) return
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }

  #setStatus(status: StreamOverlayStatus): void {
    this.#status = status
    this.#onStatus(status)
  }

  #handle(request: IncomingMessage, response: ServerResponse): void {
    if (request.method !== 'GET') return end(response, 405)
    const port = this.#port
    const allowedHosts = [`${HOST}:${port}`, `localhost:${port}`]
    if (!allowedHosts.includes(request.headers.host ?? '')) return end(response, 403)

    const path = new URL(request.url ?? '/', `http://${HOST}`).pathname
    if (path === '/events') return this.#subscribe(request, response)
    if (path === '/' || path === `/${STREAM_PAGE}`) return void this.#page(response)
    if (path.startsWith('/assets/') && !this.#devUrl) return void this.#asset(path, response)
    end(response, 404)
  }

  #subscribe(request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      ...(this.#devUrl ? { 'Access-Control-Allow-Origin': new URL(this.#devUrl).origin } : {}),
    })
    response.write(`data: ${JSON.stringify(this.#frame)}\n\n`)
    this.#clients.add(response)
    request.on('close', () => this.#clients.delete(response))
  }

  async #page(response: ServerResponse): Promise<void> {
    if (this.#devUrl) {
      const events = encodeURIComponent(`http://${HOST}:${this.#port}/events`)
      response.writeHead(302, { Location: `${this.#devUrl}/${STREAM_PAGE}?events=${events}` })
      response.end()
      return
    }
    await this.#sendFile(resolve(this.#rendererDir, STREAM_PAGE), response)
  }

  async #asset(path: string, response: ServerResponse): Promise<void> {
    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch {
      return end(response, 400)
    }
    const file = resolve(this.#rendererDir, `.${decoded}`)
    if (!file.startsWith(this.#rendererDir + sep)) return end(response, 404)
    await this.#sendFile(file, response)
  }

  async #sendFile(file: string, response: ServerResponse): Promise<void> {
    try {
      const body = await readFile(file)
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      response.end(body)
    } catch {
      end(response, 404)
    }
  }
}

function end(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end()
}
