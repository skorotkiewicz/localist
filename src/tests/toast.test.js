import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'
import preact from '@preact/preset-vite'

const chromium = '/usr/lib/chromium/chromium'

// Exercise native dialog layering without loading the project store.
const html = `<!doctype html><link rel="stylesheet" href="/src/index.css"><link rel="stylesheet" href="/src/app.css">
<div id="dialog-root"></div><div id="toast-root"></div><div id="window-root"></div><script type="module">
import { h, render } from 'preact'
import Modal from '/src/componets/Modal.jsx'
import Toast from '/src/componets/Toast.jsx'
import WindowTitlebar from '/src/componets/WindowTitlebar.jsx'
import CategoryDialog from '/src/componets/CategoryDialog.jsx'
import { removeUnusedCategory } from '/src/projects.js'
const root = document.getElementById('toast-root')
const dialogRoot = document.getElementById('dialog-root')
const wait = async predicate => {
  for (let n = 0; n < 200; n++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw Error('Notification did not reach the expected state')
}
const check = (value, message) => { if (!value) throw Error(message) }
const show = message => render(h(Toast, { message, dismiss: () => render(null, root) }), root)
const checkClickable = () => {
  const button = document.querySelector('.toast button')
  const rect = button.getBoundingClientRect()
  check(button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)), 'Notification is obscured or inert')
  button.focus()
  check(document.activeElement === button, 'Dismiss button cannot receive keyboard focus')
}
const windowActions = []
let failWindowAction = false
render(h(WindowTitlebar, { controls: Object.fromEntries(['minimize', 'toggleMaximize', 'close'].map(action => [action, async () => {
  if (failWindowAction) throw Error('Native window unavailable')
  windowActions.push(action)
}])), notify: show }), document.getElementById('window-root'))
const checkWindowControls = () => {
  const titlebarRect = document.querySelector('.window-titlebar').getBoundingClientRect()
  check(titlebarRect.left === 0 && titlebarRect.top === 0 && titlebarRect.width === innerWidth, 'Title bar moved into the dialog layout')
  const dragRegion = document.querySelector('[data-tauri-drag-region]')
  const dragRect = dragRegion.getBoundingClientRect()
  check(document.elementFromPoint(dragRect.x + 20, dragRect.y + 20) === dragRegion, 'Title text blocks native dragging')
  const buttons = [...document.querySelectorAll('.window-controls button')]
  check(buttons.length === 3, 'Window buttons are missing')
  for (const button of buttons) {
    const rect = button.getBoundingClientRect()
    check(rect.width >= 44 && rect.height >= 44, 'Window target is too small')
    check(button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)), 'Window button is obscured or inert')
    button.focus()
    check(document.activeElement === button, 'Window button cannot receive keyboard focus')
  }
}
let result = 'passed'
try {
  checkWindowControls()
  document.querySelectorAll('.window-controls button').forEach(button => button.click())
  await wait(() => windowActions.length === 3)
  check(windowActions.join(',') === 'minimize,toggleMaximize,close', 'Window actions are wired incorrectly')
  show('Project index exported')
  await wait(() => document.querySelector('.toast'))
  checkClickable()
  render(h(Modal, { title: 'Storage', close: () => render(null, dialogRoot) }, h('button', {}, 'Export')), dialogRoot)
  await wait(() => document.querySelector('dialog[open] .toast') && document.querySelector('dialog[open] .window-titlebar'))
  checkClickable()
  checkWindowControls()
  failWindowAction = true
  document.querySelector('.window-controls button').click()
  await wait(() => document.querySelector('.toast-message')?.textContent === 'Could not minimize window: Native window unavailable')
  checkClickable()
  failWindowAction = false
  show('Export failed: ' + '/a-long-folder-name'.repeat(25))
  await wait(() => document.querySelector('.toast-message')?.textContent.startsWith('Export failed:'))
  checkClickable()
  const toast = document.querySelector('.toast').getBoundingClientRect()
  check(toast.left >= 0 && toast.right <= innerWidth, 'Long error message overflows the viewport')
  document.querySelector('.toast button').click()
  await wait(() => !document.querySelector('.toast'))
  check(document.querySelector('dialog[open]'), 'Dismissing notification closed the dialog')
  show('Imported projects')
  await wait(() => document.querySelector('dialog[open] .toast'))
  document.querySelector('dialog .modal-heading button').click()
  await wait(() => document.querySelector('body > .toast') && document.querySelector('body > .window-titlebar') && !document.querySelector('dialog'))
  checkClickable()
  checkWindowControls()
  const projects = [{ category: 'Active', status: 'progress' }, { category: 'Archived', status: 'archived' }]
  let categories = ['Unused', 'Active', 'Archived']
  let attempts = 0
  let allowRemoval = false
  let removed
  const renderCategories = () => render(h(CategoryDialog, {
    open: true, projects, categories, notify: show,
    remove: async category => {
      attempts++
      if (!allowRemoval) return false
      categories = removeUnusedCategory(projects, categories, category)
      return true
    },
    onRemoved: category => { removed = category; renderCategories() },
    close: () => render(null, dialogRoot)
  }), dialogRoot)
  renderCategories()
  await wait(() => document.querySelector('dialog[open] .category-list'))
  const removeButton = name => document.querySelector('[aria-label="Remove category ' + name + '"]')
  check(removeButton('Active').disabled && removeButton('Archived').disabled, 'Used categories are removable')
  removeButton('Unused').click()
  await wait(() => document.querySelector('dialog[open] .button.danger'))
  check(document.activeElement.textContent.trim() === 'Cancel', 'Confirmation does not focus Cancel')
  check(attempts === 0, 'Opening confirmation removed a category')
  document.querySelector('dialog .modal-footer button').click()
  await wait(() => document.querySelector('dialog[open] .category-list'))
  check(attempts === 0 && removeButton('Unused'), 'Cancel changed categories')
  removeButton('Unused').click()
  await wait(() => document.querySelector('dialog[open] .button.danger'))
  document.querySelector('dialog .button.danger').click()
  await wait(() => attempts === 1)
  check(document.querySelector('dialog[open] .button.danger') && categories.includes('Unused'), 'Failed save discarded confirmation or category')
  allowRemoval = true
  document.querySelector('dialog .button.danger').click()
  await wait(() => document.querySelector('dialog[open] .category-list') && !removeButton('Unused'))
  check(removed === 'Unused' && attempts === 2 && categories.join(',') === 'Active,Archived', 'Removal changed the wrong categories')
  check(projects.length === 2 && projects[1].category === 'Archived', 'Removal changed project records')
} catch (error) {
  result = error.message
}
const output = document.createElement('pre')
output.id = 'toast-check-result'
output.textContent = result
document.body.append(output)
</script>`

test('native dialogs keep notifications and window controls usable and category removal safe', { skip: !existsSync(chromium) }, async t => {
  const server = await createServer({
    configFile: false,
    define: { __APP_VERSION__: JSON.stringify('1.2.3-test') },
    plugins: [
      preact(),
      {
        name: 'toast-check',
        configureServer(server) {
          server.middlewares.use('/toast-check', async (_request, response) => {
            response.setHeader('Content-Type', 'text/html')
            response.end(await server.transformIndexHtml('/toast-check', html))
          })
        }
      }
    ],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent'
  })
  t.after(() => server.close())
  await server.listen()
  const { stdout } = await promisify(execFile)(
    chromium,
    ['--headless', '--no-sandbox', '--disable-gpu', '--window-size=1000,800', '--dump-dom', '--virtual-time-budget=6000', `http://127.0.0.1:${server.httpServer.address().port}/toast-check`],
    { timeout: 20000, maxBuffer: 2 * 1024 * 1024 }
  )
  const result = stdout.match(/<pre id="toast-check-result">([^<]+)<\/pre>/)?.[1]
  assert.equal(result, 'passed', result || 'Browser check did not finish')
})
