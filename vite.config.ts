import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { gatewayBridge } from './server/gatewayBridge.ts'

// https://vite.dev/config/
export default defineConfig({
  // Keep assets portable when the app is published under a repository path.
  base: './',
  plugins: [react(), tailwindcss(), gatewayBridge()],
})
