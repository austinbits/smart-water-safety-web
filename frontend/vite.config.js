import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  build: {
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'map-engine', test: /maplibre-gl/ }] } } },
  },
  server: {
    host: '127.0.0.1',
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://127.0.0.1:5000', '/socket.io': { target: 'http://127.0.0.1:5000', ws: true } },
  },
})
