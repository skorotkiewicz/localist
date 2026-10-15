import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { createProjectStore, projectMiddleware } from './local-store.js'
import pkg from './package.json' with { type: 'json' }

const middleware = projectMiddleware(createProjectStore(fileURLToPath(new URL('./data/projects.json', import.meta.url))))
const localIndex = {
  name: 'local-project-index',
  configureServer(server) {
    server.middlewares.use(middleware)
  },
  configurePreviewServer(server) {
    server.middlewares.use(middleware)
  }
}

export default defineConfig({
  plugins: [preact(), localIndex],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '#platform': fileURLToPath(new URL('./platform/web.js', import.meta.url)) } },
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**', '**/frontend-backup/**'] } }
})
