// ESLint 9 flat config. Replaces the legacy .eslintrc.js (ESLint 5).
//
// Policy: the NEW simulation core (src/game) is held to strict standards;
// the legacy Electron entry points (src/main, src/renderer/*.ts) and the
// original Phaser scene scripts (*.js) carry pre-existing tech debt, so their
// findings are downgraded to warnings rather than blocking. As legacy code is
// modernised it can graduate to the strict profile.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Rules that legacy code violates pervasively; warn instead of error there.
const LEGACY_JS_RELAX = {
  'no-unused-vars': 'warn',
  'no-undef': 'warn',
  'no-empty': 'warn',
  'no-constant-condition': 'warn',
  'no-constant-binary-expression': 'warn',
  'no-prototype-builtins': 'warn',
  'prefer-const': 'warn',
};

const LEGACY_TS_RELAX = {
  '@typescript-eslint/no-require-imports': 'off',
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-namespace': 'warn',
  '@typescript-eslint/no-unused-vars': 'warn',
  'no-prototype-builtins': 'warn',
};

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'release/**', 'doc/**', 'static/**', '**/*.map'],
  },

  // --- Simulation core + server (NEW): strict -------------------------------
  {
    files: ['src/game/**/*.ts', 'src/server/**/*.ts', 'src/server/**/*.mts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Tests intentionally read loosely-typed JSON response bodies.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // --- Legacy Electron entry points (.ts): relaxed --------------------------
  {
    files: ['src/main/**/*.ts', 'src/renderer/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: LEGACY_TS_RELAX,
  },

  // --- Legacy Phaser scene scripts (.js): relaxed ---------------------------
  {
    files: ['src/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        Phaser: 'readonly',
        // Build-time constants injected by Vite define (see vite.config.ts).
        __APP_TITLE__: 'readonly',
        __APP_VERSION__: 'readonly',
        __APP_HOMEPAGE__: 'readonly',
      },
    },
    rules: LEGACY_JS_RELAX,
  },
);
