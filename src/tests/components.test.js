import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'
import preact from '@preact/preset-vite'
import { getTagColor } from '../helpers/tagColor.js'

function elements(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]
}

test('extracted components keep their actions connected', async t => {
  const server = await createServer({
    configFile: false,
    define: { __APP_VERSION__: JSON.stringify('1.2.3-test') },
    plugins: [preact()],
    server: { middlewareMode: true },
    logLevel: 'silent'
  })
  t.after(() => server.close())
  const { default: ProjectCard } = await server.ssrLoadModule('/src/componets/ProjectCard.jsx')
  const { default: Sidebar } = await server.ssrLoadModule('/src/componets/Sidebar.jsx')
  const { default: WorkspaceHeader } = await server.ssrLoadModule('/src/componets/WorkspaceHeader.jsx')
  const { default: StorageDialog } = await server.ssrLoadModule('/src/componets/StorageDialog.jsx')
  const { default: ProjectDescription } = await server.ssrLoadModule('/src/componets/ProjectDescription.jsx')
  const { default: RemoveProjectDialog } = await server.ssrLoadModule('/src/componets/RemoveProjectDialog.jsx')
  const project = {
    id: 'component-test',
    name: 'A project',
    path: '/private/project',
    repositories: ['https://github.com/user/project', 'not a URL'],
    category: 'Custom',
    description: 'The complete description.\n' + 'More detail. '.repeat(30),
    tags: ['First tag', 'Second tag', 'Hidden tag'],
    icon: 'folder',
    status: 'progress',
    public: false,
    createdAt: '2026-05-01T14:30:00Z',
    updatedAt: '2026-05-21T14:30:00Z'
  }
  const changes = []
  const copied = []
  const queried = []
  const card = ProjectCard({
    project,
    menu: project.id,
    setMenu() {},
    edit() {},
    copy: (value, message) => copied.push([value, message]),
    setCategory() {},
    setQuery: tag => queried.push(tag),
    update: (selected, change) => {
      assert.equal(selected, project)
      changes.push(change)
    }
  })
  assert.equal(card.props.style, undefined)
  assert.ok(elements(card).some(node => node.props?.class === 'project-icon'))
  assert.equal(elements(card).find(node => node.props?.class === 'tag language-tag').props.style, undefined)
  const tags = elements(card).filter(node => node.props?.class === 'tag colored-tag')
  assert.equal(tags.length, 2)
  tags.forEach((tag, index) => {
    assert.equal(tag.props.style['--tag-color'], getTagColor(project.tags[index]))
    tag.props.onClick()
  })
  assert.deepEqual(queried, project.tags.slice(0, 2))
  const description = elements(card).find(node => node.type === ProjectDescription)
  assert.deepEqual(description.props, { description: project.description })
  const disclosure = ProjectDescription(description.props)
  assert.equal(disclosure.type, 'details')
  const preview = elements(disclosure).find(node => node.type === 'summary')
  assert.equal(preview.props.title, project.description)
  assert.equal(preview.props.children, project.description)
  const emptyCard = ProjectCard({ project: { ...project, description: '' } })
  assert.equal(
    elements(emptyCard).some(node => node.type === ProjectDescription),
    false
  )
  assert.equal(
    elements(emptyCard).some(node => node.props?.class === 'project-description'),
    false
  )
  const buttons = elements(card).filter(node => node.type === 'button')
  const repositoryButtons = buttons.filter(node => node.props.class === 'repository-copy')
  assert.equal(repositoryButtons.length, 2)
  repositoryButtons.forEach(button => button.props.onClick())
  assert.deepEqual(
    copied,
    project.repositories.map(repository => [repository, 'Repository URL copied'])
  )
  assert.equal(buttons.find(node => node.props.class?.includes('repository-trigger')).props.title, project.repositories.join('\n'))
  assert.ok(buttons.some(node => node.props.title === project.name))
  assert.ok(buttons.some(node => node.props.title === project.category))
  buttons.find(node => node.props.class?.includes('visibility-button')).props.onClick()
  buttons.find(node => node.props.class?.includes('status-badge')).props.onClick()
  buttons.find(node => [node.props.children].flat().includes('Archive project')).props.onClick()
  assert.deepEqual(changes, [{ public: true }, { status: 'complete' }, { status: 'archived' }])
  const removeButton = tree => elements(tree).find(node => node.type === 'button' && [node.props.children].flat().includes('Remove project'))
  assert.equal(removeButton(card), undefined)
  assert.equal(removeButton(ProjectCard({ project: { ...project, status: 'complete' }, menu: project.id })), undefined)
  const archived = { ...project, status: 'archived' }
  let requestedRemoval
  const archivedCard = ProjectCard({
    project: archived,
    menu: archived.id,
    remove: selected => {
      requestedRemoval = selected
    }
  })
  removeButton(archivedCard).props.onClick()
  assert.equal(requestedRemoval, archived)
  let removals = 0
  let cancellations = 0
  const removalDialog = RemoveProjectDialog({
    project: archived,
    close: () => {
      cancellations++
    },
    remove: () => {
      removals++
    }
  })
  const cancel = elements(removalDialog).find(node => node.type === 'button' && [node.props.children].flat().includes('Cancel'))
  assert.equal(cancel.props.autoFocus, true)
  assert.equal(removals, 0)
  cancel.props.onClick()
  assert.equal(cancellations, 1)
  assert.equal(removals, 0)
  removeButton(removalDialog).props.onClick()
  assert.equal(removals, 1)

  let selectedCategory
  let selectedModal
  const sidebar = Sidebar({
    mobileNav: false,
    status: 'all',
    category: 'all',
    counts: { all: 2, progress: 1, complete: 0, archived: 1 },
    categories: ['Custom'],
    projects: [project, { ...project, id: 'archived', status: 'archived' }],
    saving: false,
    loaded: true,
    loadError: '',
    navigate() {},
    setModal: value => {
      selectedModal = value
    },
    onCategory: value => {
      selectedCategory = value
    }
  })
  const categoryNav = elements(sidebar).find(node => node.props?.['aria-label'] === 'Project categories')
  assert.equal(elements(categoryNav).find(node => node.props?.class === 'category-count').props.children, 1)
  assert.equal(elements(categoryNav).find(node => node.type === 'button').props.style, undefined)
  const statusNav = elements(sidebar).find(node => node.props?.['aria-label'] === 'Project status')
  assert.equal(elements(statusNav).find(node => node.props?.class === 'nav-count').props.children, 1)

  elements(categoryNav)
    .find(node => node.type === 'button')
    .props.onClick()
  assert.equal(selectedCategory, 'Custom')
  elements(sidebar)
    .find(node => node.props?.['aria-label'] === 'Manage categories')
    .props.onClick()
  assert.equal(selectedModal, 'category')
  const showcaseLinks = elements(sidebar).filter(node => node.props?.class === 'nav-item showcase-nav')
  assert.equal(showcaseLinks.length, 1)
  showcaseLinks[0].props.onClick()
  assert.equal(selectedModal, 'showcase')
  let mobileNav
  const header = WorkspaceHeader({
    status: 'all',
    category: 'all',
    setMobileNav: value => {
      mobileNav = value
    }
  })
  const headerNodes = elements(header)
  const version = headerNodes.find(node => node.props?.class === 'app-version')
  assert.equal(version.props.children.join(''), 'v1.2.3-test')
  assert.equal(headerNodes.find(node => node.type === 'strong').props.children, 'All projects')
  headerNodes.find(node => node.props?.['aria-label'] === 'Open navigation').props.onClick()
  assert.equal(mobileNav, true)
  assert.equal(
    headerNodes.some(node => /topbar-right|profile-avatar|help-button|local-badge/.test(node.props?.class ?? '')),
    false
  )
  const messages = []
  const storage = StorageDialog({ projects: [project], categories: [], loaded: false, notify: message => messages.push(message) })
  const exportButton = elements(storage).find(node => node.type === 'button' && [node.props.children].flat().includes('Export projects.json'))
  assert.ok(exportButton)
  exportButton.props.onClick()
  assert.deepEqual(messages, ['Load the JSON index before exporting.'])

  assert.equal(
    elements(sidebar).some(node => node.props?.class === 'share-card'),
    true
  )
})

test('clear search resets only the query and returns focus to the input', { skip: !existsSync('/usr/lib/chromium/chromium') }, async t => {
  const html = `<!doctype html><link rel="stylesheet" href="/src/index.css"><link rel="stylesheet" href="/src/app.css"><div id="root"></div><script type="module">
import { h, render } from 'preact'
import ProjectList from '/src/componets/ProjectList.jsx'
const project = { id: 'alpha', name: 'Alpha', path: '/alpha', category: 'Custom', description: '', tags: [], repositories: [], status: 'progress', public: true, icon: 'folder', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const projects = [project, { ...project, id: 'beta', name: 'Beta', public: false }, { ...project, id: 'other', category: 'Other' }]
const searchRef = { current: null }
render(h(ProjectList, { projects, categories: ['Custom', 'Other'], loaded: true, status: 'all', category: 'Custom', searchRef, setCategory: () => { throw Error('Clear search reset the category') } }), document.querySelector('#root'))
const check = (value, message) => { if (!value) throw Error(message) }
const wait = async predicate => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw Error('Search did not reach its expected state')
}
let result = 'passed'
try {
  const input = searchRef.current
  const clear = () => document.querySelector('[aria-label="Clear search"]')
  const count = () => document.querySelectorAll('.project-card').length
  check(!clear() && count() === 2, 'Empty search shows a clear button or incorrect results')
  input.value = 'Beta'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await wait(() => clear() && count() === 1)
  clear().focus()
  check(document.activeElement === clear(), 'Clear button cannot receive keyboard focus')
  const rect = clear().getBoundingClientRect()
  check(rect.width >= 24 && rect.height >= 24 && rect.right <= innerWidth, 'Clear button is too small or overflows')
  clear().click()
  await wait(() => !clear() && input.value === '' && count() === 2)
  check(document.activeElement === input, 'Clear search did not restore input focus')
  const visibility = document.querySelector('[aria-label="Filter visibility"]')
  visibility.value = 'public'
  visibility.dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => count() === 1)
  input.value = 'not found'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await wait(() => clear() && count() === 0)
  clear().click()
  await wait(() => !clear() && count() === 1)
  check(visibility.value === 'public' && document.activeElement === input, 'Clear search reset visibility or lost focus')
  check(document.documentElement.scrollWidth <= innerWidth, 'Search toolbar overflows')
} catch (error) { result = error.message }
const output = document.createElement('pre'); output.id = 'search-check-result'; output.textContent = result; document.body.append(output)
</script>`
  const server = await createServer({
    configFile: false,
    plugins: [
      preact(),
      {
        name: 'search-check',
        configureServer(server) {
          server.middlewares.use('/search-check', async (_request, response) => {
            response.setHeader('Content-Type', 'text/html')
            response.end(await server.transformIndexHtml('/search-check', html))
          })
        }
      }
    ],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent'
  })
  t.after(() => server.close())
  await server.listen()
  for (const width of [360, 800, 1440]) {
    const { stdout } = await promisify(execFile)(
      '/usr/lib/chromium/chromium',
      ['--headless', '--no-sandbox', '--disable-gpu', `--window-size=${width},900`, '--dump-dom', '--virtual-time-budget=3000', `http://127.0.0.1:${server.httpServer.address().port}/search-check`],
      { timeout: 20000, maxBuffer: 2 * 1024 * 1024 }
    )
    assert.equal(stdout.match(/<pre id="search-check-result">([^<]+)<\/pre>/)?.[1], 'passed', `Search browser check failed at ${width}px`)
  }
})
