import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://duncancordry.edu',
  adapter: vercel(),
  security: {
    checkOrigin: false,
  },
  vite: {
    build: {
      target: 'es2022',
    },
  },
});
