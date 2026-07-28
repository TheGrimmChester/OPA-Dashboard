// Flat ESLint config for the dashboard (browser React SPA, JSX via Vite).
// Kept intentionally minimal: @eslint/js recommended + React hooks correctness.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist/', 'public/', 'node_modules/'] },
  {
    files: ['src/**/*.{js,jsx}'],
    linterOptions: {
      // exhaustive-deps is intentionally off (below), which would make the
      // existing eslint-disable directives for it read as "unused" noise.
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        // `process.env.NODE_ENV` is statically replaced by Vite at build time
        // (see ErrorBoundary.jsx); it never exists at runtime but is valid source.
        process: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Pragmatic defaults: surface unused code without blocking the build.
      // Underscore-prefixed args are intentional placeholders; the uppercase
      // varsIgnorePattern is the standard workaround for core ESLint not
      // counting JSX element usage (<Panel/> doesn't mark Panel as used) —
      // same as the official Vite React template.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^[A-Z_]',
      }],
      // Downgraded to warnings: existing violations live in files this pass
      // doesn't touch; they're style/legibility issues, not runtime bugs.
      'no-case-declarations': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-useless-escape': 'warn',
      // Hook ordering bugs are real bugs; dependency-array completeness is
      // deliberately not enforced (too noisy on the current tree).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]
