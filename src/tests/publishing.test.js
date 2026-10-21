import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'
import preact from '@preact/preset-vite'

const adapter = `
let settings = { enabled: false, serverUrl: 'http://127.0.0.1:8080', publicUrl: null }
window.events = []; window.uploads = 0; window.saved = { projects: [], categories: [] }
export async function loadIndex() { return window.saved }
export async function download(content) { window.downloaded = content }
export async function saveIndex(index) {
  window.events.push('local-save')
  if (window.failSave) throw Error('Local write failed')
  window.saved = structuredClone(index)
  return index
}
export const publishing = {
  load: async () => ({ ...settings }),
  save: async value => {
    window.events.push('settings-save')
    if (window.failConfig) throw Error('Could not save settings')
    settings = { ...value, publicUrl: location.origin + '/documents/' + 'a'.repeat(64) }
    return { ...settings }
  },
  publish: async () => {
    window.events.push('publish')
    if (!settings.enabled) return null
    if (window.failPublish) throw Error('Server unavailable')
    window.uploads++
    return settings.publicUrl
  }
}
`

// The Rust tests verify snapshot privacy and real HTTP; this browser test checks UI/save behavior.
test('desktop publishing is opt-in and failed uploads do not fail local saves', { skip: !existsSync('/usr/lib/chromium/chromium') }, async t => {
  const html = `<!doctype html><link rel="stylesheet" href="/src/index.css"><link rel="stylesheet" href="/src/app.css"><div id="root"></div><script>
const report = message => { const output = document.createElement('pre'); output.id = 'publishing-check-result'; output.textContent = message; document.body.append(output) }
window.addEventListener('error', event => report(event.message || 'Module loading failed'))
window.addEventListener('unhandledrejection', event => report(String(event.reason)))
</script><script type="module">
import { h, render } from 'preact'
import { useState } from 'preact/hooks'
import ShowcaseDialog from '/src/componets/ShowcaseDialog.jsx'
import useProjectIndex from '/src/hooks/useProjectIndex.js'
window.messages = []
const notify = value => window.messages.push(value)
function TestApp() {
  const index = useProjectIndex(notify)
  const [open, setOpen] = useState(true)
  window.setShowcaseOpen = setOpen
  window.index = index
  return h(ShowcaseDialog, { open, projects: index.projects, notify, copy: text => { window.copied = text }, close: () => {} })
}
render(h(TestApp), document.querySelector('#root'))
const check = (value, message) => { if (!value) throw Error(message) }
const wait = async predicate => {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error('Publishing UI did not reach its expected state: ' + JSON.stringify({ events: window.events, uploads: window.uploads, checked: document.querySelector('.publishing-settings input')?.checked, disabled: document.querySelector('.publishing-settings input')?.disabled, buttons: [...document.querySelectorAll('dialog button')].map(b => [b.textContent, b.disabled]), error: document.querySelector('.publishing-settings [role=alert]')?.textContent, messages: window.messages }))
}
const section = () => document.querySelector('.publishing-settings')
const checkbox = () => section().querySelector('[type=checkbox]')
let result = 'passed'
try {
  await wait(() => window.index.loaded && checkbox() && !checkbox().disabled)
  check(!checkbox().checked, 'Publishing is enabled by default')
  check(section().querySelectorAll('input').length === 1 && section().querySelectorAll('button').length === 0, 'Publishing settings contain more than the checkbox')
  check(window.uploads === 0 && window.events.length === 0, 'Opening the dialog uploaded or saved anything')
  check(await window.index.persist([]), 'Disabled publishing blocked a local save')
  await wait(() => window.events.includes('publish'))
  check(window.uploads === 0, 'Disabled publishing uploaded data')
  checkbox().checked = true
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => window.uploads === 1 && !checkbox().disabled)
  check(window.events.filter(event => event === 'local-save').length === 1, 'Enabling publishing changed local projects')
  const download = () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Download showcase'))
  await wait(() => !download().disabled && document.querySelector('.notice').textContent.includes('when opened'))
  download().click()
  await wait(() => window.downloaded)
  check(window.downloaded.includes('<script>') && window.downloaded.includes('fetch('), 'Enabled export is still a static snapshot')
  check(!section().innerHTML.includes('/documents/'), 'Feed URL is displayed in publishing controls')
  const project = { id: 'test', name: 'Local test', path: '/private', category: 'Test', description: '', status: 'progress', public: false, tags: [], repositories: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', icon: 'folder' }
  window.events.length = 0
  check(await window.index.persist([project]), 'Enabled publishing blocked a local save')
  await wait(() => window.uploads === 2)
  check(window.events[0] === 'local-save' && window.events[1] === 'publish', 'Published before saving locally')
  window.failSave = true
  check(!(await window.index.persist([])), 'Failed local save reported success')
  await new Promise(resolve => setTimeout(resolve, 20))
  check(window.uploads === 2 && window.saved.projects.length === 1, 'Failed local save uploaded or changed data')
  window.failSave = false; window.failPublish = true
  check(await window.index.persist([]), 'Publishing failure failed a successful local save')
  notify('Changes saved')
  await wait(() => window.messages.some(message => message.includes('Saved locally. Publishing failed:')))
  check(window.messages.at(-1).includes('Publishing failed:'), 'Local save notification hid the publishing warning')
  check(window.saved.projects.length === 0, 'Publishing failure undid the local save')
  checkbox().checked = false
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => !checkbox().disabled && !checkbox().checked && !download().disabled && document.querySelector('.notice').textContent.includes('Re-export'))
  window.downloaded = null
  download().click()
  await wait(() => window.downloaded)
  check(!window.downloaded.includes('<script>'), 'Unchecked export is not an offline snapshot')
  window.failConfig = true
  checkbox().checked = true
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => section().querySelector('[role=alert]')?.textContent.includes('Could not save settings') && !checkbox().disabled)
  check(!checkbox().checked, 'Failed settings save did not restore the checkbox')
  window.failConfig = false
  checkbox().checked = true
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => checkbox().checked && !checkbox().disabled && section().querySelector('[role=alert]')?.textContent.includes('Server unavailable'))
  check(section().querySelector('[role=alert]').textContent.includes('local projects are unchanged'), 'Publishing failure did not explain local data safety')
  window.setShowcaseOpen(false)
  await wait(() => !document.querySelector('dialog'))
  window.failPublish = false
  const uploadsBefore = window.uploads
  window.setShowcaseOpen(true)
  await wait(() => section() && checkbox() && !checkbox().disabled && window.uploads === uploadsBefore + 1)
  check(checkbox().checked, 'Reopening the dialog lost the enabled setting')
  const dialog = document.querySelector('dialog')
  check(dialog.scrollWidth <= dialog.clientWidth, 'Publishing controls overflow the dialog')
  check(section().querySelector('label').getBoundingClientRect().height >= 44, 'Publishing checkbox target is too small')
} catch (error) { result = error.message }
const output = document.createElement('pre'); output.id = 'publishing-check-result'; output.textContent = result; document.body.append(output)
</script>`
  const server = await createServer({
    configFile: false,
    resolve: { alias: { '#platform': '\0publishing-test-adapter' } },
    plugins: [
      preact(),
      {
        name: 'publishing-check',
        resolveId: id => (id === '\0publishing-test-adapter' ? id : null),
        load: id => (id === '\0publishing-test-adapter' ? adapter : null),
        configureServer(server) {
          server.middlewares.use('/documents/', (_request, response) => {
            response.setHeader('Access-Control-Allow-Origin', '*')
            response.setHeader('Content-Type', 'application/json')
            response.end('{"projects":[]}')
          })
          server.middlewares.use('/publishing-check', async (_request, response) => {
            response.setHeader('Content-Type', 'text/html')
            response.end(await server.transformIndexHtml('/publishing-check', html))
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
      ['--headless', '--no-sandbox', '--disable-gpu', `--window-size=${width},900`, '--dump-dom', '--virtual-time-budget=6000', `http://127.0.0.1:${server.httpServer.address().port}/publishing-check`],
      { timeout: 20000, maxBuffer: 2 * 1024 * 1024 }
    )
    assert.equal(stdout.match(/<pre id="publishing-check-result">([^<]+)<\/pre>/)?.[1], 'passed', `Publishing browser check failed at ${width}px: ${stdout.slice(-1800)}`)
  }
})
