import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


// Deployed at https://<user>.github.io/JSON_CONVERTER/
export default defineConfig({
  base: '/JSON_CONVERTER/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
