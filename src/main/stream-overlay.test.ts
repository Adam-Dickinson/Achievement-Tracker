import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request, type IncomingMessage } from 'node:http'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type OverlayFrame,
  type StreamOverlaySettings,
  type StreamOverlayStatus,
  type VisibleToast,
} from '@shared/ipc'
import { StreamOverlayServer } from './stream-overlay'

const ON: StreamOverlaySettings = {
  ...DEFAULT_NOTIFICATION_SETTINGS.stream,
  enabled: true,
  port: 0,
}

const TOAST: VisibleToast = {
  id: 7,
  heading: 'Achievement unlocked',
  rarity: 'rare',
  title: 'Raid Ready',
  description: null,
  game: 'Destiny 2',
  platform: 'steam',
  percent: 3.5,
  platinum: false,
}

interface Reply {
  readonly status: number
  readonly headers: IncomingMessage['headers']
  readonly body: string
}

function get(port: number, path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<Reply>((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', fail)
    req.end()
  })
}

function openEvents(port: number) {
  const frames: OverlayFrame[] = []
  let waiting: (() => void) | null = null
  let buffer = ''
  const req = request({ host: '127.0.0.1', port, path: '/events' }, (res) => {
    res.setEncoding('utf8')
    res.on('data', (chunk: string) => {
      buffer += chunk
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        if (part.startsWith('data: ')) frames.push(JSON.parse(part.slice(6)) as OverlayFrame)
      }
      waiting?.()
    })
  })
  req.end()
  const next = async (count: number): Promise<OverlayFrame[]> => {
    while (frames.length < count) await new Promise<void>((done) => (waiting = done))
    return frames
  }
  return { next, close: () => req.destroy() }
}

function portOf(status: StreamOverlayStatus): number {
  return Number(new URL(status.url ?? '').port)
}

describe('StreamOverlayServer', () => {
  let dir: string
  let server: StreamOverlayServer
  let statuses: StreamOverlayStatus[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stream-overlay-'))
    writeFileSync(join(dir, 'stream.html'), '<html>stream page</html>')
    writeFileSync(join(dir, 'index.html'), '<html>main app</html>')
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', 'stream-abc.js'), 'console.log(1)')
    writeFileSync(join(dir, 'secret.txt'), 'nope')
    statuses = []
    server = new StreamOverlayServer({ rendererDir: dir, onStatus: (s) => statuses.push(s) })
  })

  afterEach(async () => {
    await server.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('is off until enabled', () => {
    expect(server.status).toEqual({ state: 'off', url: null, message: null })
  })

  it('starts on localhost and reports its URL', async () => {
    const status = await server.configure(ON)

    expect(status.state).toBe('running')
    expect(status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    expect(statuses.at(-1)).toEqual(status)
  })

  it('serves the stream page at the root and by name', async () => {
    const port = portOf(await server.configure(ON))

    for (const path of ['/', '/stream.html']) {
      const reply = await get(port, path)
      expect(reply.status).toBe(200)
      expect(reply.headers['content-type']).toContain('text/html')
      expect(reply.body).toBe('<html>stream page</html>')
    }
  })

  it('serves built assets with a content type', async () => {
    const port = portOf(await server.configure(ON))

    const reply = await get(port, '/assets/stream-abc.js')
    expect(reply.status).toBe(200)
    expect(reply.headers['content-type']).toContain('text/javascript')
  })

  it('serves nothing outside the stream page and its assets', async () => {
    const port = portOf(await server.configure(ON))

    expect((await get(port, '/index.html')).status).toBe(404)
    expect((await get(port, '/secret.txt')).status).toBe(404)
    expect((await get(port, '/assets/../secret.txt')).status).toBe(404)
    expect((await get(port, '/assets/%2e%2e/secret.txt')).status).toBe(404)
    expect((await get(port, '/assets/missing.js')).status).toBe(404)
  })

  it('refuses requests for another host name', async () => {
    const port = portOf(await server.configure(ON))

    expect((await get(port, '/', { Host: 'evil.example' })).status).toBe(403)
    expect((await get(port, '/', { Host: `localhost:${port}` })).status).toBe(200)
  })

  it('only answers GET', async () => {
    const port = portOf(await server.configure(ON))

    expect((await get(port, '/', {}, 'POST')).status).toBe(405)
  })

  it('sends the current frame on connect and every published frame after', async () => {
    const port = portOf(await server.configure(ON))
    const events = openEvents(port)

    const [first] = await events.next(1)
    expect(first).toEqual({
      toasts: [],
      corner: 'top-left',
      scale: 1,
      sound: { enabled: true, volume: 0.6 },
    })

    server.publish([TOAST])
    const frames = await events.next(2)
    expect(frames[1]?.toasts).toEqual([TOAST])
    events.close()
  })

  it('uses the stream chime settings in its frames', async () => {
    const port = portOf(await server.configure({ ...ON, sound: { enabled: false, volume: 0.1 } }))
    const events = openEvents(port)

    const [first] = await events.next(1)
    expect(first?.sound).toEqual({ enabled: false, volume: 0.1 })
    events.close()
  })

  it('stops when disabled', async () => {
    const port = portOf(await server.configure(ON))

    const status = await server.configure({ ...ON, enabled: false })

    expect(status).toEqual({ state: 'off', url: null, message: null })
    await expect(get(port, '/')).rejects.toThrow()
  })

  it('reports a busy port instead of throwing', async () => {
    const blocker: Server = createServer()
    await new Promise<void>((done) => blocker.listen(0, '127.0.0.1', () => done()))
    const busy = (blocker.address() as { port: number }).port

    const status = await server.configure({ ...ON, port: busy })

    expect(status.state).toBe('error')
    expect(status.url).toBeNull()
    expect(status.message).toContain(`Port ${busy} is already in use`)
    await new Promise<void>((done) => blocker.close(() => done()))
  })

  it('keeps running when configured again with the same port', async () => {
    const first = await server.configure(ON)
    const again = await server.configure({ ...ON, sound: { enabled: false, volume: 0.6 } })

    expect(again.url).toBe(first.url)
  })

  it('sends keep-alive comments to connected pages', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] })
    const timed = new StreamOverlayServer({ rendererDir: dir, keepAliveMs: 1000 })
    const port = portOf(await timed.configure(ON))
    const chunks: string[] = []
    const req = request({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => chunks.push(chunk))
    })
    req.end()
    await vi.waitFor(() => expect(chunks.length).toBeGreaterThan(0), { timeout: 2000 })

    vi.advanceTimersByTime(1000)

    await vi.waitFor(() => expect(chunks.join('')).toContain(': keep-alive'), { timeout: 2000 })
    req.destroy()
    await timed.stop()
    vi.useRealTimers()
  })

  it('sends the dev page address with a link back to its events in dev', async () => {
    const dev = new StreamOverlayServer({ rendererDir: dir, devUrl: 'http://localhost:5173' })
    const port = portOf(await dev.configure(ON))

    const page = await get(port, '/')
    expect(page.status).toBe(302)
    expect(page.headers.location).toBe(
      `http://localhost:5173/stream.html?events=${encodeURIComponent(`http://127.0.0.1:${port}/events`)}`,
    )
    expect((await get(port, '/assets/stream-abc.js')).status).toBe(404)
    await dev.stop()
  })
})
