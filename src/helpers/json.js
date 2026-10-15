import { download } from '#platform'
import { validateIndex } from '../projects.js'

export { download }

export async function exportJSON({ loaded, projects, categories, notify }) {
  if (!loaded) {
    notify('Load the JSON index before exporting.')
    return
  }
  try {
    const path = await download(JSON.stringify({ projects, categories }, null, 2), 'projects.json', 'application/json')
    notify(path ? `Project index exported to ${path}` : 'Project index download started')
  } catch (error) {
    notify(`Export failed: ${error.message || String(error)}`)
  }
}

export async function importJSON(e, { projects, categories, persist, notify, setModal }) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    if (file.size > 10000000) throw new Error('Choose a JSON file smaller than 10 MB.')
    const incoming = validateIndex(JSON.parse(await file.text()))
    const map = new Map(projects.map(p => [p.id, p]))
    incoming.projects.forEach(p => map.set(p.id, p))
    if (await persist([...map.values()], [...new Set([...categories, ...incoming.categories])])) {
      notify(`Imported ${incoming.projects.length} projects`)
      setModal(null)
    }
  } catch (error) {
    notify(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message)
  }
  e.target.value = ''
}
