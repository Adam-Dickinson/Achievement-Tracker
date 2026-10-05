import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import { PRODUCTION_CSP } from './src/shared/csp'

const shared = resolve('src/shared')

function productionCsp(): Plugin {
  return {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: PRODUCTION_CSP },
          injectTo: 'head-prepend',
        },
      ],
    },
  }
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { external: ['node:sqlite'] } },
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
  },
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
