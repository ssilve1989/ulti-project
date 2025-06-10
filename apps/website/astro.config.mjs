import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'static',
  build: {
    assets: 'assets'
  },
  vite: {
    define: {
      __GUILD_ID__: JSON.stringify('913492538516717578'),
    },
    server: {
      proxy: {
        // Proxy API calls to your backend server
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
}); 
