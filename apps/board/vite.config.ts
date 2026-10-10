import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  // Same origin as the API in dev too, so better-auth's cookies are sent.
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
