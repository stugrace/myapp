import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import fs from 'fs'
import path from 'path'

// Generate self-signed certificate if it doesn't exist
const certDir = path.join(process.cwd(), '.certs')
const certFile = path.join(certDir, 'cert.pem')
const keyFile = path.join(certDir, 'key.pem')

let httpsConfig = false
if (process.env.HTTPS !== 'false') {
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true })
  }
  
  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    httpsConfig = {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile),
    }
  } else {
    console.log('ℹ️  Generating self-signed certificate...')
    console.log('To generate proper certificates, run:')
    console.log('  openssl req -x509 -newkey rsa:4096 -nodes -out .certs/cert.pem -keyout .certs/key.pem -days 365')
    httpsConfig = true
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  base: '/',
  server: {
    proxy: {
      '/api/geocode': {
        target: 'https://geocoding.geo.census.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/geocode/, '/geocoder/locations/onelineaddress'),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['Access-Control-Allow-Origin'] = '*'
          })
        },
      },
    },
    allowedHosts: ['localhost', 'stuarts-imac-2.local', '192.168.1.159'],
    host: '0.0.0.0',
  },
})

