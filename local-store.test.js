import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createProjectStore, projectMiddleware } from './local-store.js'

function fixture() {
  const file = join(mkdtempSync(join(tmpdir(), 'localist-test-')), 'data', 'projects.json')
  return { file, store: createProjectStore(file) }
}

test('the file store initializes an empty index and saves custom categories', () => {
  const { file, store } = fixture()
  assert.deepEqual(store.read(), { projects: [], categories: [] })
  store.write({ projects: [], categories: ['My category'] })
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { projects: [], categories: ['My category'] })
  assert.deepEqual(createProjectStore(file).read().categories, ['My category'])
})

test('invalid writes and unreadable JSON do not replace an existing index', () => {
  const { file, store } = fixture()
  store.read()
  const original = readFileSync(file, 'utf8')
  assert.throws(() => store.write({ projects: [null], categories: [] }))
  assert.equal(readFileSync(file, 'utf8'), original)
  writeFileSync(file, '{broken json')
  assert.throws(() => store.read())
  assert.throws(() => store.write({ projects: [], categories: [] }))
  assert.equal(readFileSync(file, 'utf8'), '{broken json')
})

test('the local endpoint loads and saves JSON and rejects invalid or cross-origin writes', async t => {
  const { store } = fixture()
  const middleware = projectMiddleware(store)
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/api/projects`
  const get = await fetch(url)
  assert.deepEqual(await get.json(), { projects: [], categories: [] })
  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projects: [], categories: ['Saved'] }) })
  assert.equal(put.status, 200)
  assert.deepEqual(store.read().categories, ['Saved'])
  const bad = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"projects":[null],"categories":[]}' })
  assert.equal(bad.status, 400)
  const crossOrigin = await fetch(url, { method: 'PUT', headers: { Origin: 'https://another-site.example', 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(crossOrigin.status, 403)
  const crossSiteRead = await fetch(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } })
  assert.equal(crossSiteRead.status, 403)
  assert.deepEqual(store.read().categories, ['Saved'])
  const text = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '{}' })
  assert.equal(text.status, 415)
})
