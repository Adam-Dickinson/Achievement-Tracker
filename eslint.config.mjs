import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // .superdesign is git-ignored local design tooling, not part of the app.
    ignores: [
      'out',
      'dist',
      'node_modules',
      'coverage',
      'docs/design/mockups',
      'resources',
      '.superdesign',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Main process, preload and shared code run in Node.
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts', '*.ts', '*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // The React UI runs in a browser context.
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
)
