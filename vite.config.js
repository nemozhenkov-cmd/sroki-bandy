
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  base: '/sroki-bandy/',
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString())
  },
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    host: '0.0.0.0',
    https: true
  }
})
