// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // No raster images are processed (thumbnails come from YouTube), so skip the Images binding.
  adapter: cloudflare({ imageService: 'passthrough' }),
  // Admin auth uses a signed cookie, not Astro sessions, so no KV namespace is needed.
  session: false,

  security: {
    // Lesson saves carry PDFs (25 MB each, 90 MB per save). Workers cap requests at 100 MB.
    actionBodySizeLimit: 95 * 1024 * 1024,
  },

  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Atkinson Hyperlegible Next',
      cssVariable: '--font-atkinson',
      weights: ['200 800'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
