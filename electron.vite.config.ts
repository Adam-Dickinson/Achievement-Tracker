import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

const shared = resolve('src/shared')

// A strict Content-Security-Policy for the built app. It is only injected in production builds:
// the dev server needs inline scripts for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ')

function productionCsp(): Plugin {
  return {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ],
    },
  }
}

export default defineConfig({
  // Main process: Node.js. Owns windows, tray, database and (later) providers and sync.
  main: {
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { external: ['node:sqlite'] } },
  },
  // Preload: the small, sandboxed bridge between the main process and the UI.
  // (package.json must NOT set "type": "module": the main and preload bundles have to be
  // CommonJS, because sandboxed preload scripts and Electron's main process load them that way.)
  preload: {
    resolve: { alias: { '@shared': shared } },
  },
  // Renderer: the React UI. Two windows, so two HTML entry points.
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': shared } },
    plugins: [react(), tailwindcss(), productionCsp()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
        },
      },
    },
  },
})
