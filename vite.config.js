import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const finalDeliverable = () => ({
  name: 'final-deliverable',
  closeBundle() {
    copyFileSync(
      resolve('dist/resourcetracker-entry.html'),
      resolve('resourcetracker-redesigned.html')
    )
  }
})

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: 'resourcetracker-entry.html'
    }
  },
  plugins: [react(), viteSingleFile(), finalDeliverable()],
})
