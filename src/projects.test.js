import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoProjects, filterProjects, generateShowcase, validateProjects } from './projects.js'

test('the example index survives a JSON round trip', () => {
  assert.deepEqual(validateProjects(JSON.parse(JSON.stringify(demoProjects))), demoProjects)
  assert.deepEqual(validateProjects([]), [])
})

test('filters match paths and tags, combine filters, and sort without mutating the index', () => {
  assert.equal(filterProjects(demoProjects, { query: '~/Dev/Rust' }).length, 2)
  assert.equal(filterProjects(demoProjects, { query: '  SELF-HOSTED ' })[0].name, 'Bunboard')
  assert.equal(filterProjects(demoProjects, { category: 'Rust', status: 'complete' }).length, 0)
  assert.equal(filterProjects(demoProjects, { visibility: 'public' }).length, 4)
  const names = filterProjects(demoProjects, { sort: 'name' }).map(p => p.name)
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
  assert.equal(demoProjects[0].name, 'Pocket CLI')
})

test('invalid imports are rejected before replacing any stored projects', () => {
  for (const bad of [null, {}, [null], [demoProjects[0], demoProjects[0]], [{ ...demoProjects[0], status: 'constructor' }], [{ ...demoProjects[0], public: 'true' }], [{ ...demoProjects[0], updatedAt: 'not-a-date' }], [{ ...demoProjects[0], tags: [null] }], [{ ...demoProjects[0], path: '' }]]) {
    assert.throws(() => validateProjects(bad))
  }
  const project = validateProjects([{ ...demoProjects[0], unexpectedSecret: 'secret' }])[0]
  assert.equal(project.unexpectedSecret, undefined)
})

test('public HTML never includes private project data or local paths', () => {
  const html = generateShowcase(demoProjects)
  for (const p of demoProjects) {
    assert.ok(!html.includes(p.path))
    assert.equal(html.includes(`<h2>${p.name}</h2>`), p.public)
    if (!p.public) assert.ok(!html.includes(p.description))
  }
})

test('showcase title, descriptions, categories, and tags are escaped against HTML injection', () => {
  const html = generateShowcase([{ ...demoProjects[0], name: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>', category: '<b>Rust</b>', tags: ['<iframe>'] }], '</title><script>bad()</script>')
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('<iframe>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('&lt;b&gt;Rust&lt;/b&gt;'))
  assert.ok(generateShowcase([]).includes('No public projects yet.'))
})
