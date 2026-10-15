import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterProjects, generateShowcase, validateIndex, validateProjects } from '../projects.js'
import { exportJSON, importJSON } from '../helpers/json.js'

const project = {
  id: 'test-1',
  name: 'Test project',
  path: '/private/test/project',
  description: 'Test description',
  category: 'Custom category',
  tags: ['Test tag'],
  status: 'progress',
  public: true,
  icon: 'folder',
  createdAt: '2026-05-01T14:30:00Z',
  updatedAt: '2026-05-21T14:30:00Z'
}

test('extracted JSON helpers receive their dependencies explicitly', async () => {
  const messages = []
  exportJSON({ loaded: false, projects: [], categories: [], notify: m => messages.push(m) })
  assert.deepEqual(messages, ['Load the JSON index before exporting.'])
  const e = { target: { value: 'projects.json', files: [{ size: 2, text: async () => '[]' }] } }
  await importJSON(e, {
    projects: [project],
    categories: ['Custom'],
    persist: async (projects, categories) => {
      assert.deepEqual(projects, [project])
      assert.deepEqual(categories, ['Custom'])
      return true
    },
    notify: m => messages.push(m),
    setModal: value => assert.equal(value, null)
  })
  assert.equal(e.target.value, '')
  assert.equal(messages[1], 'Imported 0 projects')
})

test('a new index has no projects or preset categories', () => {
  assert.deepEqual(validateIndex({ projects: [], categories: [] }), {
    projects: [],
    categories: []
  })
  assert.deepEqual(validateIndex([]), { projects: [], categories: [] })
})

test('custom categories survive JSON export and import, even without projects', () => {
  const index = { projects: [project], categories: ['Custom category', 'An empty category'] }
  assert.deepEqual(validateIndex(JSON.parse(JSON.stringify(index))), index)
  assert.deepEqual(validateIndex({ projects: [], categories: ['Custom', 'Custom'] }).categories, ['Custom'])
  assert.throws(() => validateIndex({ projects: [], categories: ['  '] }))
})

test('filters match paths and tags, combine filters, and do not mutate input', () => {
  const projects = [project, { ...project, id: 'test-2', name: 'Another project', public: false }]
  assert.equal(filterProjects(projects, { query: '/private/test' }).length, 2)
  assert.equal(filterProjects(projects, { query: ' TEST TAG ' }).length, 2)
  assert.equal(filterProjects(projects, { category: 'Custom category', status: 'complete' }).length, 0)
  assert.equal(filterProjects(projects, { visibility: 'public' }).length, 1)
  assert.equal(filterProjects(projects, { sort: 'name' })[0].name, 'Another project')
  assert.equal(projects[0].name, 'Test project')
})

test('invalid imports are rejected and unknown fields are not persisted', () => {
  for (const bad of [null, {}, [null], [project, project], [{ ...project, status: 'constructor' }], [{ ...project, public: 'true' }], [{ ...project, updatedAt: 'not-a-date' }], [{ ...project, tags: [null] }], [{ ...project, path: '' }]]) {
    assert.throws(() => validateProjects(bad))
  }
  assert.equal(validateProjects([{ ...project, secret: 'secret' }])[0].secret, undefined)
})

test('public HTML excludes private projects and all local paths', () => {
  const privateProject = {
    ...project,
    id: 'private',
    name: 'Private project',
    description: 'Private description',
    public: false
  }
  const html = generateShowcase([project, privateProject])
  assert.ok(html.includes('<h2>Test project</h2>'))
  assert.ok(!html.includes(privateProject.name))
  assert.ok(!html.includes(privateProject.description))
  assert.ok(!html.includes(project.path))
})

test('showcase content is escaped against HTML injection', () => {
  const html = generateShowcase(
    [
      {
        ...project,
        name: '<script>alert(1)</script>',
        description: '<img src=x onerror=alert(1)>',
        category: '<b>Custom</b>',
        tags: ['<iframe>']
      }
    ],
    '</title><script>bad()</script>'
  )
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('<iframe>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('&lt;b&gt;Custom&lt;/b&gt;'))
  assert.ok(generateShowcase([]).includes('No public projects yet.'))
})

test('creation sorting is newest first while last updated remains the default', () => {
  const older = { ...project, id: 'older', createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z' }
  const newer = { ...project, id: 'newer', createdAt: '2026-05-15T00:00:00Z', updatedAt: '2026-05-20T00:00:00Z' }
  const projects = [older, newer]
  assert.deepEqual(
    filterProjects(projects).map(p => p.id),
    ['older', 'newer']
  )
  assert.deepEqual(
    filterProjects(projects, { sort: 'updated' }).map(p => p.id),
    ['older', 'newer']
  )
  assert.deepEqual(
    filterProjects(projects, { sort: 'created' }).map(p => p.id),
    ['newer', 'older']
  )
  assert.deepEqual(
    projects.map(p => p.id),
    ['older', 'newer']
  )
  const edited = { ...older, updatedAt: '2026-06-01T00:00:00Z' }
  assert.deepEqual(
    filterProjects([edited, newer], { sort: 'created' }).map(p => p.id),
    ['newer', 'older']
  )
})

test('legacy projects gain a stable creation-date fallback and invalid creation dates are rejected', () => {
  const legacy = { ...project }
  delete legacy.createdAt
  const migrated = validateProjects([legacy])[0]
  assert.equal(migrated.createdAt, legacy.updatedAt)
  assert.equal(validateProjects([{ ...migrated, updatedAt: '2026-06-01T00:00:00Z' }])[0].createdAt, legacy.updatedAt)
  for (const createdAt of [null, 123, '', 'not-a-date']) {
    assert.throws(() => validateProjects([{ ...project, createdAt }]))
  }
  const newerLegacy = { ...legacy, id: 'newer-legacy', updatedAt: '2026-06-01T00:00:00Z' }
  assert.deepEqual(
    filterProjects([legacy, newerLegacy], { sort: 'created' }).map(p => p.id),
    ['newer-legacy', legacy.id]
  )
})

test('creation dates sort by time across time zones and keep ties stable', () => {
  const later = { ...project, id: 'later', createdAt: '2026-05-01T10:00:00-04:00' }
  const earlier = { ...project, id: 'earlier', createdAt: '2026-05-01T13:00:00Z' }
  assert.deepEqual(
    filterProjects([earlier, later], { sort: 'created' }).map(p => p.id),
    ['later', 'earlier']
  )
  assert.deepEqual(
    filterProjects([project, { ...project, id: 'tied' }], { sort: 'created' }).map(p => p.id),
    [project.id, 'tied']
  )
})
