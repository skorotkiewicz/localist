import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'
import preact from '@preact/preset-vite'

const adapter = `
let settings = { enabled: false, autoPublish: true, serverUrl: 'http://127.0.0.1:8080', publicUrl: null }
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
    if (value.serverUrl === 'bad') throw Error('Invalid server URL')
    settings = { ...value, publicUrl: location.origin + '/documents/' + 'a'.repeat(64) }
    return { ...settings }
  },
  publish: async (automatic = false) => {
    window.events.push(automatic ? 'auto-publish' : 'publish')
    if (!settings.enabled || (automatic && !settings.autoPublish)) return null
    if (window.failPublish) throw Error('Server unavailable')
    window.uploads++
    return settings.publicUrl
  }
}
`

// The Rust tests verify snapshot privacy and real HTTP; this browser test checks UI/save behavior.
test('desktop publishing skips private-only saves and preserves local changes on upload failure', { skip: !existsSync('/usr/lib/chromium/chromium') }, async t => {
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
const autoCheckbox = () => section().querySelectorAll('[type=checkbox]')[1]
const button = text => [...section().querySelectorAll('button')].find(button => button.textContent.includes(text))
const serverInput = () => section().querySelector('[type=url]')
const idle = () => !section().querySelector('fieldset').disabled
let result = 'passed'
try {
  await wait(() => window.index.loaded && checkbox() && idle())
  check(section().tagName === 'DETAILS' && !section().open, 'Publishing settings are not collapsed by default')
  check(!serverInput().checkVisibility(), 'Collapsed publishing settings expose controls')
  const summary = section().querySelector('summary')
  summary.focus()
  check(document.activeElement === summary, 'Publishing disclosure is not keyboard focusable')
  check(summary.getBoundingClientRect().height >= 44, 'Publishing disclosure target is too small')
  summary.click()
  await wait(() => section().open && serverInput().checkVisibility())
  check(!checkbox().checked && button('Publish now').disabled, 'Publishing is enabled by default')
  check(autoCheckbox().checked && autoCheckbox().disabled, 'Automatic publishing default or disabled state is incorrect')
  check(serverInput().value === 'http://127.0.0.1:8080' && button('Save publishing settings').disabled, 'Publishing defaults or save state are incorrect')
  check(window.uploads === 0 && window.events.length === 0, 'Opening the dialog uploaded or saved anything')
  check(await window.index.persist([]), 'Disabled publishing blocked a local save')
  await new Promise(resolve => setTimeout(resolve, 20))
  check(window.uploads === 0 && window.events.every(event => event === 'local-save'), 'Unchanged public data triggered publishing')
  checkbox().checked = true
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => !button('Save publishing settings').disabled)
  check(window.uploads === 0 && button('Publish now').disabled, 'Unsaved settings were applied')
  button('Save publishing settings').click()
  await wait(() => window.uploads === 1 && idle())
  check(window.events.filter(event => event === 'local-save').length === 1, 'Saving publishing settings changed local projects')
  const download = () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Download showcase'))
  await wait(() => !download().disabled && document.querySelector('.notice').textContent.includes('when opened'))
  download().click()
  await wait(() => window.downloaded)
  check(window.downloaded.includes('<script>') && window.downloaded.includes('fetch('), 'Enabled export is still a static snapshot')
  const feed = () => section().querySelector('input[readonly]')
  check(feed()?.value.includes('/documents/'), 'Public JSON feed is missing')
  button('Copy public feed URL').click()
  check(window.copied === feed().value, 'Copied URL differs from the public feed')
  const savesBeforePublish = window.events.filter(event => event === 'local-save').length
  button('Publish now').click()
  await wait(() => window.uploads === 2 && idle())
  check(window.events.filter(event => event === 'local-save').length === savesBeforePublish, 'Publish now changed local projects')
  serverInput().value = 'bad'
  serverInput().dispatchEvent(new Event('input', { bubbles: true }))
  await wait(() => !button('Save publishing settings').disabled && button('Publish now').disabled)
  button('Save publishing settings').click()
  await wait(() => section().querySelector('[role=alert]')?.textContent.includes('Invalid server URL') && idle())
  check(serverInput().value === 'bad' && window.uploads === 2, 'Failed settings save discarded input or published')
  serverInput().value = 'http://127.0.0.1:8080'
  serverInput().dispatchEvent(new Event('input', { bubbles: true }))
  await wait(() => button('Save publishing settings').disabled && !button('Publish now').disabled)
  const project = { id: 'test', name: 'Public test', path: '/private', category: 'Test', description: '', status: 'progress', public: true, tags: [], repositories: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', icon: 'folder' }
  const privateProject = { ...project, id: 'private', name: 'Private test', category: 'Private only', public: false }
  const checkPrivateSaves = async publicProjects => {
    const uploads = window.uploads
    const messages = window.messages.length
    window.events.length = 0
    window.failPublish = true
    for (const next of [
      [...publicProjects, privateProject],
      [...publicProjects, { ...privateProject, name: 'Edited private project', tags: ['Private tag'] }],
      [privateProject, ...publicProjects],
      publicProjects,
      publicProjects.map(p => ({ ...p, path: '/changed/local/path' })),
      publicProjects
    ]) check(await window.index.persist(next), 'Private-only save failed with an unreachable server')
    check(await window.index.persist(publicProjects, ['Unused category']), 'Unused category save failed')
    check(await window.index.persist(publicProjects, []), 'Unused category removal failed')
    await new Promise(resolve => setTimeout(resolve, 20))
    check(window.uploads === uploads && window.events.every(event => event === 'local-save'), 'Private-only or unchanged public data triggered publishing')
    check(window.messages.length === messages, 'Private-only changes showed a publishing warning')
    window.failPublish = false
  }
  await checkPrivateSaves([])
  window.events.length = 0
  check(await window.index.persist([project]), 'Enabled publishing blocked a local save')
  await wait(() => window.uploads === 3)
  check(window.events[0] === 'local-save' && window.events[1] === 'auto-publish', 'Published before saving locally')
  await checkPrivateSaves([project])
  const editedPublic = { ...project, name: 'Edited public project', category: 'Shared category', status: 'complete', updatedAt: '2026-01-02' }
  const persist = window.index.persist
  for (const next of [[editedPublic], [{ ...editedPublic, public: false }], [editedPublic], [], [project]]) {
    const uploads = window.uploads
    check(await persist(next), 'Public change failed to save locally through a retained handler')
    await wait(() => window.uploads === uploads + 1)
  }
  const uploadsBeforeFailures = window.uploads
  window.failSave = true
  check(!(await window.index.persist([])), 'Failed local save reported success')
  await new Promise(resolve => setTimeout(resolve, 20))
  check(window.uploads === uploadsBeforeFailures && window.saved.projects.length === 1, 'Failed local save uploaded or changed data')
  window.failSave = false; window.failPublish = true
  check(await window.index.persist([]), 'Publishing failure failed a successful local save')
  notify('Changes saved')
  await wait(() => window.messages.some(message => message.includes('Saved locally. Publishing failed:')))
  check(window.messages.at(-1).includes('Publishing failed:'), 'Local save notification hid the publishing warning')
  check(window.saved.projects.length === 0, 'Publishing failure undid the local save')
  checkbox().checked = false
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => !button('Save publishing settings').disabled)
  button('Save publishing settings').click()
  await wait(() => idle() && !checkbox().checked && !download().disabled && document.querySelector('.notice').textContent.includes('Re-export'))
  window.downloaded = null
  download().click()
  await wait(() => window.downloaded)
  check(!window.downloaded.includes('<script>'), 'Unchecked export is not an offline snapshot')
  window.failConfig = true
  checkbox().checked = true
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => !button('Save publishing settings').disabled)
  button('Save publishing settings').click()
  await wait(() => section().querySelector('[role=alert]')?.textContent.includes('Could not save settings') && idle())
  check(checkbox().checked && !button('Save publishing settings').disabled, 'Failed settings save discarded the draft')
  check(document.querySelector('.notice').textContent.includes('Re-export'), 'Failed settings save changed the active export mode')
  window.failConfig = false
  button('Save publishing settings').click()
  await wait(() => checkbox().checked && idle() && section().querySelector('[role=alert]')?.textContent.includes('Server unavailable'))
  check(section().querySelector('[role=alert]').textContent.includes('local projects are unchanged'), 'Publishing failure did not explain local data safety')
  window.failPublish = false
  const uploadsBeforeRetry = window.uploads
  button('Publish now').click()
  await wait(() => window.uploads === uploadsBeforeRetry + 1 && idle() && !section().querySelector('[role=alert]'))
  autoCheckbox().checked = false
  autoCheckbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => !button('Save publishing settings').disabled)
  const uploadsBeforeManual = window.uploads
  button('Save publishing settings').click()
  await wait(() => idle() && button('Save publishing settings').disabled)
  check(window.uploads === uploadsBeforeManual, 'Saving manual mode uploaded a snapshot')
  check(checkbox().checked && !autoCheckbox().checked, 'Manual mode disabled publishing entirely')
  check(document.querySelector('.notice').textContent.includes('when opened'), 'Manual mode disabled live showcase exports')
  window.events.length = 0
  check(await window.index.persist([project]), 'Manual mode blocked the local save')
  await wait(() => window.events.includes('auto-publish'))
  check(window.uploads === uploadsBeforeManual && window.saved.projects.length === 1, 'Manual mode uploaded a local save or lost local data')
  button('Publish now').click()
  await wait(() => window.uploads === uploadsBeforeManual + 1 && idle())
  check(window.events.filter(event => event === 'local-save').length === 1, 'Manual publish changed local projects')
  window.setShowcaseOpen(false)
  await wait(() => !document.querySelector('dialog'))
  window.events.length = 0
  window.setShowcaseOpen(true)
  await wait(() => section() && checkbox() && idle() && !document.querySelector('.modal-footer .button.primary').disabled)
  check(checkbox().checked && !autoCheckbox().checked, 'Reopening lost manual mode')
  check(window.uploads === uploadsBeforeManual + 1 && window.events.length === 0, 'Opening settings uploaded in manual mode')
  check(!section().open, 'Reopening the dialog did not collapse publishing settings')
  section().querySelector('summary').click()
  await wait(() => section().open && serverInput().checkVisibility())
  autoCheckbox().checked = true
  autoCheckbox().dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => !button('Save publishing settings').disabled)
  button('Save publishing settings').click()
  await wait(() => window.uploads === uploadsBeforeManual + 2 && idle())
  window.setShowcaseOpen(false)
  await wait(() => !document.querySelector('dialog'))
  window.setShowcaseOpen(true)
  await wait(() => section() && checkbox() && idle() && window.uploads === uploadsBeforeManual + 3)
  check(autoCheckbox().checked, 'Reopening lost automatic mode')
  section().querySelector('summary').click()
  await wait(() => section().open && serverInput().checkVisibility())
  const dialog = document.querySelector('dialog')
  check(dialog.scrollWidth <= dialog.clientWidth, 'Publishing controls overflow the dialog')
  check(section().querySelector('label').getBoundingClientRect().height >= 44, 'Publishing checkbox target is too small')
  for (const control of section().querySelectorAll('button, input[type=url], input[readonly]')) check(control.getBoundingClientRect().height >= 44, 'Publishing control is too small')
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
