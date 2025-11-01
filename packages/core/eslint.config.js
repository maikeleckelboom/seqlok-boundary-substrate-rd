import regex from 'eslint-plugin-regex';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { defineConfig } from 'eslint/config';

const HERE = dirname(fileURLToPath(import.meta.url));

const IGNORES = [
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.vite/**',
  '**/.output/**',
  '**/generated/**',
  '**/node_modules/**',
];

const SRC = ['src/**/*.{ts,tsx}'];
const TESTS = ['tests/**/*.{ts,tsx}', '**/*.test.ts', '**/*.spec.ts'];
const EXAMPLES = ['examples/**/*.{ts,tsx}'];
const ALL_TS = [...SRC, ...TESTS, ...EXAMPLES];

// Layered boundaries (relative to packages/core)
const LAYERS = {
  primitives: 'src/primitives',
  types: 'src/types',
  spec: 'src/spec',
  backing: 'src/backing',
  bindings: 'src/bindings',
};

export default defineConfig(
  // Global ignores
  { ignores: IGNORES },

  // TS-ESLint presets (typed) scoped to our TS files
  ...tseslint.configs.strictTypeChecked.map((c) => ({ ...c, files: ALL_TS })),
  ...tseslint.configs.stylisticTypeChecked.map((c) => ({ ...c, files: ALL_TS })),

  // eslint-plugin-import presets
  ...[importPlugin.flatConfigs.recommended, importPlugin.flatConfigs.typescript].map(
    (c) => ({
      ...c,
      files: ALL_TS,
    }),
  ),

  // Project settings + base rules
  {
    files: ALL_TS,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: HERE,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    settings: {
      'import/resolver': {
        typescript: { project: ['./tsconfig.eslint.json'], alwaysTryTypes: true },
        node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
      },
      'import/ignore': ['\\?url$', '^virtual:', '^vite(-client)?$'],
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Hygiene
      curly: ['error', 'all'],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-console': 'warn',

      // TypeScript
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 3,
        },
      ],

      // Imports
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/newline-after-import': 'error',
      'import/extensions': [
        'error',
        'never',
        { ts: 'never', tsx: 'never', js: 'never', jsx: 'never' },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: true, optionalDependencies: false, peerDependencies: true },
      ],
      // No cycles across layers
      'import/no-cycle': ['error', { maxDepth: 2 }],

      // Directional flow lock (production code only; tests override below)
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // primitives cannot import anything above it
            {
              target: LAYERS.primitives,
              from: LAYERS.types,
              message: 'primitives must not import types',
            },
            {
              target: LAYERS.primitives,
              from: LAYERS.spec,
              message: 'primitives must not import spec',
            },
            {
              target: LAYERS.primitives,
              from: LAYERS.backing,
              message: 'primitives must not import backing',
            },
            {
              target: LAYERS.primitives,
              from: LAYERS.bindings,
              message: 'primitives must not import bindings',
            },

            // types cannot import spec/backing/bindings
            {
              target: LAYERS.types,
              from: LAYERS.spec,
              message: 'types must not import spec',
            },
            {
              target: LAYERS.types,
              from: LAYERS.backing,
              message: 'types must not import backing',
            },
            {
              target: LAYERS.types,
              from: LAYERS.bindings,
              message: 'types must not import bindings',
            },

            // spec cannot import backing/bindings
            {
              target: LAYERS.spec,
              from: LAYERS.backing,
              message: 'spec must not import backing',
            },
            {
              target: LAYERS.spec,
              from: LAYERS.bindings,
              message: 'spec must not import bindings',
            },

            // backing cannot import bindings
            {
              target: LAYERS.backing,
              from: LAYERS.bindings,
              message: 'backing must not import bindings',
            },
          ],
        },
      ],
    },
  },

  // Tests and examples: allow crossing boundaries for white-box testing
  {
    files: [...TESTS, ...EXAMPLES],
    rules: {
      'import/no-restricted-paths': 'off',
    },
  },

  // Regex bans for fence-style banners
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { regex: { rules: regex.rules } },
    rules: {
      'regex/invalid': [
        'error',
        [
          {
            id: 'no-fence-singleline',
            message: 'Avoid fence-style section headers; prefer concise JSDoc.',
            regex: String.raw`^\s*//\s*([=\-*_/\u2500-\u257F\u23AF\u2013\u2014\u2015\u2212])\1{3,}.*$`,
            regexOptions: 'u',
          },
          {
            id: 'no-fence-block-start',
            message: 'Avoid banner block comment starts.',
            regex: String.raw`^\s*/\*+\s*([=\-*_/\u2500-\u257F\u23AF\u2013\u2014\u2015\u2212])\1{3,}.*$`,
            regexOptions: 'u',
          },
          {
            id: 'no-fence-block-line',
            message: 'Avoid banner lines inside block comments.',
            regex: String.raw`^\s*\*\s*([=\-*_/\u2500-\u257F\u23AF\u2013\u2014\u2015\u2212])\1{3,}\s*(?:\*/)?\s*$`,
            regexOptions: 'u',
          },
          {
            id: 'no-fence-one-line-block',
            message: 'Avoid one-line banner comments.',
            regex: String.raw`^\s*/\*+\s*([=\-*_/\u2500-\u257F\u23AF\u2013\u2014\u2015\u2212])\1{3,}\s*\*+/\s*$`,
            regexOptions: 'u',
          },
        ],
      ],
    },
  },
);
