import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Vite 8 runs on Rolldown: build.rolldownOptions is canonical (rollupOptions is
// a deprecated alias). Splitting three / postprocessing / r3f / react into their
// own chunks clears the large-bundle warning and improves caching; lazy-loading
// the Scene (App.tsx) additionally makes three fetch on Canvas mount, not on boot.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 30 },
            {
              name: 'postprocessing',
              test: /(node_modules[\\/]postprocessing|@react-three[\\/]postprocessing)/,
              priority: 20,
            },
            { name: 'r3f', test: /@react-three[\\/](fiber|drei)/, priority: 10 },
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
