import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { gatewayBridge } from './server/gatewayBridge.ts'
import { projectBridge } from './server/projectBridge.ts'
import { codexBridge } from './server/codexBridge.ts'
import { omniRouteBridge } from './server/omniRouteBridge.ts'

// https://vite.dev/config/
export default defineConfig({
  // Keep assets portable when the app is published under a repository path.
  base: './',
  plugins: [react(), tailwindcss(), gatewayBridge(), projectBridge(), codexBridge(), omniRouteBridge()],
})
