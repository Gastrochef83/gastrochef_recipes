import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // HOTFIX: Avoid rare production-only TDZ/runtime errors caused by minifier renaming/reordering.
  // This keeps the build stable on Vercel. Re-enable minification later (Day 7+) once confirmed stable.
  build: {
    minify: false
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
