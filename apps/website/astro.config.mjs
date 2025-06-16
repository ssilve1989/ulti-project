import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

// Regex for image file extensions
const IMAGE_EXTENSIONS = /png|jpe?g|svg|gif|tiff|bmp|ico/i;

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'static',
  build: {
    assets: 'assets',
    inlineStylesheets: 'auto',
  },
  image: {
    // Optimize PNG icons more aggressively
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        limitInputPixels: false,
      },
    },
    // Add some common sizes for your icons
    domains: [],
    remotePatterns: [],
  },
  vite: {
    define: {
      __GUILD_ID__: JSON.stringify('913492538516717578'),
    },
    server: {
      proxy: {
        // Proxy API calls to your backend server - be more specific to avoid conflicts
        '/api/': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    // Optimize asset handling
    build: {
      rollupOptions: {
        output: {
          // Better asset naming for caching
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (IMAGE_EXTENSIONS.test(ext)) {
              return 'images/[name]-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
    },
  },
});
