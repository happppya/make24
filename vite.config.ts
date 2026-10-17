/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [vue()],
  // GitHub Pages serves a project site from /<repo>/, so production builds use
  // relative asset URLs: the bundle then works there, at a domain root, or from
  // any sub-folder. Runtime assets in `public/` go through assetUrl(), which is
  // built on BASE_URL for the same reason.
  base: command === 'build' ? './' : '/',
  test: {
    environment: 'jsdom',
  },
}))
