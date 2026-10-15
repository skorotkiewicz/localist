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
<div id="dialog-root"></div><div id="toast-root"></div><script type="module">
import { h, render } from 'preact'
import Modal from '/src/componets/Modal.jsx'
import Toast from '/src/componets/Toast.jsx'
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
let result = 'passed'
try {
  show('Project index exported')
  await wait(() => document.querySelector('.toast'))
  checkClickable()
  render(h(Modal, { title: 'Storage', close: () => render(null, dialogRoot) }, h('button', {}, 'Export')), dialogRoot)
  await wait(() => document.querySelector('dialog[open] .toast'))
  checkClickable()
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
  await wait(() => document.querySelector('body > .toast') && !document.querySelector('dialog'))
  checkClickable()
} catch (error) {
  result = error.message
}
const output = document.createElement('pre')
output.id = 'toast-check-result'
output.textContent = result
document.body.append(output)
</script>`

test('notifications remain readable and interactive with native dialogs', { skip: !existsSync(chromium) }, async t => {
  const server = await createServer({
    configFile: false,
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
