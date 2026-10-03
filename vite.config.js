import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  base: '/sroki-bandy/',
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    host: '0.0.0.0',
    https: true
  }
})