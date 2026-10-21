import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'
import { generateShowcase } from '../projects.js'
import { getTagColor } from '../helpers/tagColor.js'

const source = 'http://127.0.0.1:8080/documents/' + 'a'.repeat(64)
const project = { id: 'live', name: 'Live project', category: 'Public', description: '', tags: ['Rust'], repositories: [], public: true, status: 'complete', path: '/never/publish' }
let production
async function productionGenerator() {
  if (!production)
    production = build({
      configFile: false,
      logLevel: 'silent',
      build: { write: false, minify: true, lib: { entry: resolve('src/projects.js'), formats: ['es'] } }
    }).then(result => import('data:text/javascript;base64,' + Buffer.from((Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk').code).toString('base64')))
  return (await production).generateShowcase
}

function script(html) {
  return html.match(/<script>([\s\S]*?)<\/script>/)[1]
}

test('live exports contain only a public read URL, no snapshot, credentials, polling or event refreshes', () => {
  const html = generateShowcase([project, { ...project, name: 'PRIVATE RECORD', public: false }], 'Live', source)
  assert.ok(html.includes(source))
  assert.ok(!html.includes(project.name))
  assert.ok(!html.includes(project.path))
  assert.ok(!html.includes('PRIVATE RECORD'))
  assert.doesNotMatch(script(html), /Bearer|Authorization|setInterval|addEventListener/)
  assert.ok(script(html).includes("credentials: 'omit'"))
  for (const url of ['javascript:alert(1)', 'http://example.com/documents/' + 'a'.repeat(64), source + '?token=secret', source.replace('127.0.0.1', 'user:secret@127.0.0.1')]) {
    assert.throws(() => generateShowcase([], 'Bad URL', url))
  }
})

test('production-built showcase loads once, escapes server data, and reload reads the changed status', async () => {
  const generate = await productionGenerator()
  const html = generate([], 'Live', source)
  const grid = { innerHTML: '' },
    count = { textContent: '' },
    status = { textContent: '' }
  let requests = 0
  let data = {
    projects: [
      { ...project, name: '<img src=x onerror=alert(1)>' },
      { ...project, name: 'PRIVATE RECORD', public: false }
    ]
  }
  const context = {
    document: { querySelector: selector => ({ '.grid': grid, '.project-count': count, '.sync-status': status })[selector] },
    AbortSignal,
    fetch: async (url, options) => {
      requests++
      assert.equal(url, source)
      assert.equal(options.credentials, 'omit')
      assert.equal(options.cache, 'no-store')
      return { ok: true, json: async () => data }
    }
  }
  await runInNewContext(script(html), context)
  assert.equal(requests, 1)
  assert.equal(status.textContent, '')
  assert.ok(grid.innerHTML.includes('status-complete'))
  assert.ok(grid.innerHTML.includes('&lt;img'))
  assert.ok(!grid.innerHTML.includes('<img'))
  assert.ok(!grid.innerHTML.includes('PRIVATE RECORD'))
  assert.ok(grid.innerHTML.includes(getTagColor('Rust')))
  data = { projects: [{ ...project, status: 'progress' }] }
  assert.equal(requests, 1)
  assert.ok(grid.innerHTML.includes('status-complete'))
  await runInNewContext(script(html), context)
  assert.equal(requests, 2)
  assert.ok(grid.innerHTML.includes('status-progress'))
  assert.equal(count.textContent, '1 public project')
  context.fetch = async () => {
    throw Error('offline')
  }
  await runInNewContext(script(html), context)
  assert.ok(status.textContent.includes('Refresh the page'))
})

test('the same exported file reads the latest status on every open using default Chromium file-origin rules', { skip: !existsSync('/usr/lib/chromium/chromium') }, async t => {
  let current = { ...project }
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method, authorization: request.headers.authorization })
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ projects: [current] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const directory = await mkdtemp(join(tmpdir(), 'localist-live-showcase-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, 'showcase.html')
  const generate = await productionGenerator()
  const html = generate([], 'Live file', `http://127.0.0.1:${server.address().port}/documents/${'a'.repeat(64)}`)
  await writeFile(file, html)
  const open = async () =>
    (await promisify(execFile)('/usr/lib/chromium/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', '--virtual-time-budget=3000', pathToFileURL(file).href], { timeout: 20000, maxBuffer: 2 * 1024 * 1024 })).stdout
  const complete = await open()
  assert.match(complete, /class="status status-complete"/)
  assert.equal(requests.length, 1)
  current = { ...project, status: 'progress' }
  const progress = await open()
  assert.match(progress, /class="status status-progress"/)
  assert.equal(requests.length, 2)
  assert.ok(requests.every(request => request.method === 'GET' && !request.authorization))
  assert.equal(await readFile(file, 'utf8'), html)
})
