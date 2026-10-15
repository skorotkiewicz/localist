import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import preact from '@preact/preset-vite'

function elements(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]
}

test('extracted card and sidebar keep their actions connected', async t => {
  const server = await createServer({
    configFile: false,
    plugins: [preact()],
    server: { middlewareMode: true },
    logLevel: 'silent'
  })
  t.after(() => server.close())
  const { default: ProjectCard } = await server.ssrLoadModule('/src/componets/ProjectCard.jsx')
  const { default: Sidebar } = await server.ssrLoadModule('/src/componets/Sidebar.jsx')
  const project = {
    id: 'component-test',
    name: 'A project',
    path: '/private/project',
    category: 'Custom',
    description: '',
    tags: [],
    icon: 'folder',
    status: 'progress',
    public: false,
    createdAt: '2026-05-01T14:30:00Z',
    updatedAt: '2026-05-21T14:30:00Z'
  }
  const changes = []
  const card = ProjectCard({
    project,
    menu: project.id,
    setMenu() {},
    edit() {},
    copy() {},
    setCategory() {},
    setQuery() {},
    update: (selected, change) => {
      assert.equal(selected, project)
      changes.push(change)
    }
  })
  const buttons = elements(card).filter(node => node.type === 'button')
  buttons.find(node => node.props.class?.includes('visibility-button')).props.onClick()
  buttons.find(node => node.props.class?.includes('status-badge')).props.onClick()
  buttons.find(node => [node.props.children].flat().includes('Archive project')).props.onClick()
  assert.deepEqual(changes, [{ public: true }, { status: 'complete' }, { status: 'archived' }])

  let selectedCategory
  const sidebar = Sidebar({
    mobileNav: false,
    status: 'all',
    category: 'all',
    counts: { all: 1, progress: 1, complete: 0, archived: 0 },
    categories: ['Custom'],
    projects: [project],
    saving: false,
    loaded: true,
    loadError: '',
    navigate() {},
    setModal() {},
    onCategory: value => {
      selectedCategory = value
    }
  })
  const categoryNav = elements(sidebar).find(node => node.props?.['aria-label'] === 'Project categories')
  elements(categoryNav)
    .find(node => node.type === 'button')
    .props.onClick()
  assert.equal(selectedCategory, 'Custom')
})
