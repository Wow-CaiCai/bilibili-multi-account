import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/vendor/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        unsafeWindow: 'readonly',
        GM_getValue: 'readonly',
        GM_setValue: 'readonly',
        GM_addValueChangeListener: 'readonly',
        GM_registerMenuCommand: 'readonly',
        GM_xmlhttpRequest: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.cjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
    rules: { 'no-undef': 'error' },
  },
];
