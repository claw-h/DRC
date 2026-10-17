import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://duncancordry.edu',
  output: 'static',
  adapter: node({
    mode: 'standalone',
  }),
  security: {
    checkOrigin: true,
  },
  vite: {
    build: {
      target: 'es2022',
    },
  },
});
