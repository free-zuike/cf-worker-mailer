import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^cloudflare:sockets$/,
        replacement: fileURLToPath(new URL('./test-stubs/cloudflare-sockets.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    server: {
      deps: {
        // 让 node_modules 中的 CJS 依赖也走 vite 转换，别名才能生效
        inline: [/.*/],
      },
    },
    exclude: ['node_modules', 'dist', 'web', '.mimocode'],
  },
});