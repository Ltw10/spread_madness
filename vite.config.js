import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { join } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // GitHub Pages (and similar hosts) serve 404.html for unknown paths. Copy index so direct
    // navigation to /spread_madness/draft or /spread_madness/admin loads the SPA and the router works.
    mode === 'production' && {
      name: 'copy-404',
      closeBundle() {
        const out = join(process.cwd(), 'dist')
        copyFileSync(join(out, 'index.html'), join(out, '404.html'))
      },
    },
  ].filter(Boolean),
  // Use root base for local dev so http://localhost:5173/ works; use repo path for GitHub Pages build
  base: mode === 'production' ? '/spread_madness/' : '/',
}))
