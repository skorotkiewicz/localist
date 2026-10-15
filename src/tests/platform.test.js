import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import * as platform from '#platform'
import * as web from '../../platform/web.js'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('Node tests use the web adapter by default', () => {
  assert.equal(platform.loadIndex, web.loadIndex)
  assert.equal(platform.saveIndex, web.saveIndex)
  assert.equal(platform.download, web.download)
})

test('both Vite builds share one frontend and select their own adapter', { skip: !existsSync(resolve(root, 'tauri/node_modules/vite')) }, async () => {
  const webConfig = await resolveConfig({ configFile: resolve(root, 'vite.config.js') }, 'build')
  const desktopConfig = await resolveConfig({ configFile: resolve(root, 'tauri/vite.config.js') }, 'build')
  assert.equal(resolve(webConfig.root), resolve(root))
  assert.equal(resolve(desktopConfig.root), resolve(root))
  assert.equal(desktopConfig.publicDir, webConfig.publicDir)
  assert.notEqual(desktopConfig.cacheDir, webConfig.cacheDir)
  assert.equal(webConfig.resolve.alias.find(alias => alias.find === '#platform').replacement, resolve(root, 'platform/web.js'))
  assert.equal(desktopConfig.resolve.alias.find(alias => alias.find === '#platform').replacement, resolve(root, 'tauri/platform.js'))
  assert.equal(resolve(desktopConfig.root, desktopConfig.build.outDir), resolve(root, 'tauri/dist'))
  assert.ok(desktopConfig.resolve.dedupe.includes('preact'))
  assert.ok(!desktopConfig.plugins.some(plugin => plugin.name === 'local-project-index'))
  assert.ok(desktopConfig.server.fs.deny.includes('**/data/**'))
  const desktop = await import('../../tauri/platform.js')
  assert.deepEqual(Object.keys(desktop).sort(), Object.keys(web).sort())
})
