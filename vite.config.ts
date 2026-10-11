import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
  build: { rollupOptions: { input: { main: 'index.html', p0: 'p0.html', v2: 'v2.html' } } },
});
