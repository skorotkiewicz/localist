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
  const { default: ProjectDescription, fitDescription } = await server.ssrLoadModule('/src/componets/ProjectDescription.jsx')
  const project = {
    id: 'component-test',
    name: 'A project',
    path: '/private/project',
    repositories: ['https://github.com/user/project', 'not a URL'],
    category: 'Custom',
    description: 'The complete description.\n' + 'More detail. '.repeat(30),
    tags: [],
    icon: 'folder',
    status: 'progress',
    public: false,
    createdAt: '2026-05-01T14:30:00Z',
    updatedAt: '2026-05-21T14:30:00Z'
  }
  const changes = []
  const copied = []
  const card = ProjectCard({
    project,
    menu: project.id,
    setMenu() {},
    edit() {},
    copy: (value, message) => copied.push([value, message]),
    setCategory() {},
    setQuery() {},
    update: (selected, change) => {
      assert.equal(selected, project)
      changes.push(change)
    }
  })
  const description = elements(card).find(node => node.type === ProjectDescription)
  assert.deepEqual(description.props, { description: project.description })
  const originalGetComputedStyle = globalThis.getComputedStyle
  let lineHeight = '20px'
  globalThis.getComputedStyle = () => ({ lineHeight })
  try {
    let lines
    const preview = {
      open: false,
      clientHeight: 79,
      firstElementChild: {},
      style: {
        setProperty: (name, value) => {
          assert.equal(name, '--description-lines')
          lines = value
        }
      }
    }
    fitDescription(preview)
    assert.equal(lines, '3')
    preview.clientHeight = 100
    fitDescription(preview)
    assert.equal(lines, '5')
    preview.clientHeight = 10
    fitDescription(preview)
    assert.equal(lines, '1')
    lineHeight = '19.2px'
    preview.clientHeight = 38
    fitDescription(preview)
    assert.equal(lines, '2')
    preview.open = true
    preview.clientHeight = 300
    fitDescription(preview)
    assert.equal(lines, '2')
  } finally {
    if (originalGetComputedStyle) globalThis.getComputedStyle = originalGetComputedStyle
    else Reflect.deleteProperty(globalThis, 'getComputedStyle')
  }
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

  let selectedCategory
  let selectedModal
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
    setModal: value => {
      selectedModal = value
    },
    onCategory: value => {
      selectedCategory = value
    }
  })
  const categoryNav = elements(sidebar).find(node => node.props?.['aria-label'] === 'Project categories')
  elements(categoryNav)
    .find(node => node.type === 'button')
    .props.onClick()
  assert.equal(selectedCategory, 'Custom')
  const showcaseLinks = elements(sidebar).filter(node => node.props?.class === 'nav-item showcase-nav')
  assert.equal(showcaseLinks.length, 1)
  showcaseLinks[0].props.onClick()
  assert.equal(selectedModal, 'showcase')
  assert.equal(
    elements(sidebar).some(node => node.props?.class === 'share-card'),
    false
  )
})
