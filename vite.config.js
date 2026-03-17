import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Use root base for local dev so http://localhost:5173/ works; use repo path for GitHub Pages build
  base: mode === 'production' ? '/spread_madness/' : '/',
}))
