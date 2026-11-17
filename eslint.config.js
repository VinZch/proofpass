// ESLint 扁平配置。
// 只检查手写代码：chain/upgrade 的浏览器模块、scripts、tests。
// vendor 里的 ethers 打包文件、构建产物、证据和静态站点不参与。
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.npm-cache/**',
      'chain/vendor/**',
      'artifacts/**',
      'evidence/**',
      'deployment/**',
      'simulation-research/**',
      'demo-placeholders/**',
      'course-closeout/**',
      'audit_source/**',
      '.work/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['chain/**/*.js', 'upgrade/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // 检查脚本会在 page.evaluate 回调里写浏览器代码，因此同时允许 node 与 browser 全局。
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
