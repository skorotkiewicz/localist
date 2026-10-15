import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { createProjectStore, projectMiddleware } from './local-store.js'

const middleware = projectMiddleware(createProjectStore(fileURLToPath(new URL('./data/projects.json', import.meta.url))))
const localIndex = {
  name: 'local-project-index',
  configureServer(server) { server.middlewares.use(middleware) },
  configurePreviewServer(server) { server.middlewares.use(middleware) },
}

export default defineConfig({
  plugins: [preact(), localIndex],
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**'] } },
})
