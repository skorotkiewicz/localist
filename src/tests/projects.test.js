import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterProjects, generateShowcase, removeArchivedProject, removeUnusedCategory, validateIndex, validateProjects } from '../projects.js'
import { exportJSON, importJSON } from '../helpers/json.js'
import { getTagColor } from '../helpers/tagColor.js'
import { getProjectIcon } from '../helpers/projectIcon.js'

const project = {
  id: 'test-1',
  name: 'Test project',
  path: '/private/test/project',
  description: 'Test description',
  category: 'Custom category',
  tags: ['Test tag'],
  repositories: [],
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
  const content = JSON.stringify({ projects: [], categories: [] })
  const e = { target: { value: 'projects.json', files: [{ size: content.length, text: async () => content }] } }
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

test('tag icon selection matches the examples and ignores tag case and order', () => {
  for (const [tags, expected] of [
    [['CLI', 'Productivity'], 'terminal'],
    [['Dashboard', 'Self-hosted'], 'layout'],
    [['Website', 'Personal'], 'window'],
    [['Database', 'Experiment'], 'leaf'],
    [['API', 'Side project'], 'bookmark'],
    [['Config', 'Tools'], 'code'],
    [['Notes', 'Local-first'], 'book'],
    [['Automation', 'Script'], 'image'],
    [['API', 'Learning'], 'sun'],
    [['code'], 'code'],
    [['web'], 'layout'],
    [['frontend'], 'layout'],
    [['desktop'], 'window'],
    [['gui'], 'window'],
    [['docs'], 'book']
  ]) {
    const normalized = tags.map(tag => ` ${tag.toUpperCase()} `)
    assert.equal(getProjectIcon({ tags: normalized }), expected)
    assert.equal(getProjectIcon({ tags: normalized.reverse() }), expected)
  }
  assert.equal(getProjectIcon({ tags: ['CLI', 'API', 'Learning'] }), 'sun')
  assert.equal(getProjectIcon({ tags: ['Personal', 'Productivity', 'Tools', 'Learning'] }), 'folder')
  assert.equal(getProjectIcon({ tags: [] }), 'folder')
})

test('a new index has no projects or preset categories', () => {
  assert.deepEqual(validateIndex({ projects: [], categories: [] }), {
    projects: [],
    categories: []
  })
  assert.throws(() => validateIndex([]))
  assert.throws(() => validateIndex([project]))
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

test('visibility filters distinguish public and private projects and combine with other filters', () => {
  const privateProject = { ...project, id: 'private', public: false, tags: ['Private tag'] }
  const other = { ...privateProject, id: 'other', category: 'Other' }
  const archived = { ...privateProject, id: 'archived', status: 'archived' }
  const publicArchived = { ...project, id: 'public-archived', status: 'archived' }
  const projects = [project, privateProject, other, archived, publicArchived]
  assert.deepEqual(filterProjects(projects, { visibility: 'all' }), [project, privateProject, other])
  assert.deepEqual(filterProjects(projects, { visibility: 'public' }), [project])
  assert.deepEqual(filterProjects(projects, { visibility: 'private' }), [privateProject, other])
  assert.deepEqual(filterProjects(projects, { visibility: 'private', category: project.category, query: 'PRIVATE TAG' }), [privateProject])
  assert.deepEqual(filterProjects(projects, { visibility: 'private', status: 'archived' }), [archived])
  assert.deepEqual(filterProjects(projects, { visibility: 'public', status: 'archived' }), [publicArchived])
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

test('showcase uses public-only counts, neutral categories, colored tags, and no external resources', () => {
  const html = generateShowcase([
    { ...project, tags: ['Public tag'] },
    { ...project, id: 'complete', status: 'complete' },
    { ...project, id: 'archived', status: 'archived' },
    { ...project, id: 'private', name: 'PRIVATE_PROJECT', public: false }
  ])
  assert.ok(html.includes('3 public projects'))
  assert.ok(!html.includes('PRIVATE_PROJECT'))
  assert.ok(html.includes('<span class="category">Custom category</span>'))
  assert.ok(html.includes(`style="--tag-color:${getTagColor('Public tag')}"`))
  for (const status of ['progress', 'complete', 'archived']) assert.ok(html.includes(`class="status status-${status}"`))
  assert.doesNotMatch(html, /<(script|link|img|iframe)\b/i)
  assert.ok(generateShowcase([project]).includes('1 public project</span>'))
  assert.ok(generateShowcase([{ ...project, public: false }]).includes('0 public projects'))
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

test('project fields are required and invalid creation dates are rejected', () => {
  for (const field of ['createdAt', 'repositories']) {
    const incomplete = { ...project }
    delete incomplete[field]
    assert.throws(() => validateProjects([incomplete]))
  }
  for (const createdAt of [null, 123, '', 'not-a-date']) {
    assert.throws(() => validateProjects([{ ...project, createdAt }]))
  }
  for (const repositories of [null, 'repository', [123]]) {
    assert.throws(() => validateProjects([{ ...project, repositories }]))
  }
  for (const icon of [null, 123]) {
    assert.throws(() => validateProjects([{ ...project, icon }]))
  }
  const withoutIcon = { ...project }
  delete withoutIcon.icon
  assert.equal(validateProjects([withoutIcon])[0].icon, 'folder')
  assert.equal(validateProjects([{ ...project, icon: 'terminal' }])[0].icon, 'terminal')
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

test('repository entries accept arbitrary text and survive JSON round trips', () => {
  const repositories = ['https://github.com/user/project', 'https://git.example.com/user/project', 'not a valid URL', 'git@server:repo', '  leave these spaces  ', 'javascript:alert(1)']
  const index = { projects: [{ ...project, repositories }], categories: [] }
  assert.deepEqual(validateIndex(JSON.parse(JSON.stringify(index))), index)
  assert.equal(filterProjects(index.projects, { query: 'git.example.com' }).length, 1)
  assert.equal(filterProjects(index.projects, { query: 'not a valid URL' }).length, 1)
})

test('showcase repository text is escaped and private repository entries stay private', () => {
  const repositories = ['https://github.com/user/project', 'not a valid URL', '<img src=x onerror=alert(1)>', 'javascript:alert(1)']
  const html = generateShowcase([
    { ...project, repositories },
    { ...project, public: false, repositories: ['PRIVATE_REPOSITORY'] }
  ])
  assert.ok(html.includes(repositories[0]))
  assert.ok(html.includes(repositories[1]))
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('href="javascript:'))
  assert.ok(!html.includes('PRIVATE_REPOSITORY'))
  assert.ok(!html.includes(project.path))
})

test('archived projects appear only in Archived, including with search and category filters', () => {
  const completed = { ...project, id: 'completed', status: 'complete' }
  const archived = { ...project, id: 'archived', status: 'archived' }
  const projects = [project, completed, archived]
  for (const options of [{}, { status: 'all' }, { category: project.category }, { query: project.name }, { visibility: 'public' }, { sort: 'created' }]) {
    assert.deepEqual(filterProjects(projects, options), [project, completed])
  }
  assert.deepEqual(filterProjects(projects, { status: 'archived' }), [archived])
  assert.deepEqual(filterProjects(projects, { status: 'archived', category: project.category, query: project.name }), [archived])
  assert.deepEqual(filterProjects(projects, { status: 'progress' }), [project])
  assert.deepEqual(filterProjects(projects, { status: 'complete' }), [completed])
  assert.deepEqual(filterProjects([archived]), [])
  assert.equal(projects.length, 3)
  assert.equal(archived.status, 'archived')
})

test('removal only deletes the selected archived entry and leaves other records intact', () => {
  const completed = { ...project, id: 'completed', status: 'complete' }
  const archived = { ...project, id: 'archived', status: 'archived' }
  const otherArchive = { ...project, id: 'another-archive', status: 'archived' }
  const projects = [project, completed, archived, otherArchive]
  assert.deepEqual(removeArchivedProject(projects, archived.id), [project, completed, otherArchive])
  for (const id of [project.id, completed.id, 'missing']) {
    assert.deepEqual(removeArchivedProject(projects, id), projects)
  }
  assert.deepEqual(projects, [project, completed, archived, otherArchive])
  assert.deepEqual(removeArchivedProject([], archived.id), [])
})

test('only unused categories can be removed, including checks against archived projects', () => {
  const categories = [project.category, 'Unused']
  for (const status of ['progress', 'complete', 'archived']) {
    const projects = [{ ...project, status }]
    assert.equal(removeUnusedCategory(projects, categories, project.category), categories)
    assert.deepEqual(removeUnusedCategory(projects, categories, 'Unused'), [project.category])
    assert.deepEqual(projects, [{ ...project, status }])
  }
  assert.equal(removeUnusedCategory([], categories, 'Missing'), categories)
  assert.deepEqual(categories, [project.category, 'Unused'])
})
