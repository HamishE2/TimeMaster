import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const finalDeliverable = () => ({
  name: 'final-deliverable',
  closeBundle() {
    copyFileSync(
      resolve('dist/timemaster-entry.html'),
      resolve('timemaster-redesigned.html')
    )
  }
})

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: 'timemaster-entry.html'
    }
  },
  plugins: [react(), viteSingleFile(), finalDeliverable()],
})
