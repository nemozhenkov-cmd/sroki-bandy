
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  base: '/sroki-bandy/',
  define: {
    __APP_RELEASE__: JSON.stringify(version),
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
