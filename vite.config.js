import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const finalDeliverable = () => ({
  name: 'final-deliverable',
  closeBundle() {
    copyFileSync(
      resolve('dist/index.html'),
      resolve('timemaster-redesigned.html')
    )
    copyFileSync(
      resolve('dist/index.html'),
      resolve('timemaster-entry.html')
    )
  }
})

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: 'index.html'
    }
  },
  plugins: [react(), viteSingleFile(), finalDeliverable()],
})
