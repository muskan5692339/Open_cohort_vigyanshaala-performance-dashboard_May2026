import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // exceljs + main app bundles exceed Vite's 500 kB default; this is a warning only.
    chunkSizeWarningLimit: 1200,
  },
})
