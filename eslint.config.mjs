// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Base: JS recommended rules for ALL files (including .mjs and .test.js)
  eslint.configs.recommended,

  // TypeScript rules: only for .ts source files
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.strictTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Node.js globals for .mjs scripts; allow _-prefixed unused vars
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },

  // Node.js globals for standalone JS files (skill libs, etc.)
  {
    files: ['skills/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Node.js globals for .test.js files; allow _-prefixed unused vars
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // Test files legitimately match ANSI escape sequences via \x1b in regex
      'no-control-regex': 'off',
    },
  },

  // Override TypeScript rules for test files (JavaScript and TypeScript)
  {
    files: ['**/*.test.ts', '**/*.test.js'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },

  // TypeScript test files: relaxed unused-vars (allow _ prefix)
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },

  // JS files: relaxed unused-vars for callback patterns
  {
    files: ['**/*.js', '**/*.mjs'],
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },

  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '.claude/',
      '.codegraph/',
      '.apollo-toolkit/',
      'resources/',
      'docs/',
      'assets/',
      '**/assets/',
      '**/architecture_diff/',
      'skills/init-project-html/sample-demo/',
      'skills/init-project-html/lib/atlas/cli.js',
    ],
  },
);
