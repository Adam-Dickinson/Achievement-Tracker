import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests run in Node by default. UI tests opt in to a browser-like DOM with a
// `// @vitest-environment jsdom` comment at the top of the file.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
