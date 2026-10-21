import { getTagColor } from './helpers/tagColor.js'

export const STATUS_LABELS = {
  progress: 'In progress',
  complete: 'Completed',
  archived: 'Archived'
}

export function validateProjects(value) {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Choose a JSON array with up to 10,000 projects.')
  const ids = new Set()
  return value.map(p => {
    if (
      !p ||
      typeof p !== 'object' ||
      typeof p.id !== 'string' ||
      !p.id ||
      ids.has(p.id) ||
      !['name', 'path', 'description', 'category'].every(key => typeof p[key] === 'string' && p[key].length <= 10000) ||
      !p.name.trim() ||
      !p.path.trim() ||
      !p.category.trim() ||
      !Object.hasOwn(STATUS_LABELS, p.status) ||
      typeof p.public !== 'boolean' ||
      !Array.isArray(p.tags) ||
      p.tags.length > 30 ||
      !p.tags.every(t => typeof t === 'string' && t.length <= 100) ||
      !Array.isArray(p.repositories) ||
      !p.repositories.every(repository => typeof repository === 'string') ||
      (p.icon !== undefined && typeof p.icon !== 'string') ||
      typeof p.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(p.updatedAt)) ||
      typeof p.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(p.createdAt))
    ) {
      throw new Error('Invalid project data. Check required fields, unique IDs, repository lists, and dates.')
    }
    ids.add(p.id)
    return {
      id: p.id,
      name: p.name,
      path: p.path,
      description: p.description,
      category: p.category,
      tags: p.tags,
      repositories: p.repositories,
      status: p.status,
      public: p.public,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      icon: p.icon ?? 'folder'
    }
  })
}

export function validateIndex(value) {
  if (!value || !Array.isArray(value.categories) || value.categories.length > 1000 || !value.categories.every(c => typeof c === 'string' && c.trim().length > 0 && c.length <= 60)) {
    throw new Error('The index needs projects and a list of category names.')
  }
  return {
    projects: validateProjects(value.projects),
    categories: [...new Set(value.categories.map(c => c.trim()))]
  }
}

export function filterProjects(projects, { status = 'all', category = 'all', query = '', visibility = 'all', sort = 'updated' } = {}) {
  const needle = query.toLowerCase().trim()
  return projects
    .filter(
      p =>
        (status === 'all' ? p.status !== 'archived' : p.status === status) &&
        (category === 'all' || p.category === category) &&
        (visibility === 'all' || p.public === (visibility === 'public')) &&
        [p.name, p.path, p.description, p.category, ...p.tags, ...p.repositories].join(' ').toLowerCase().includes(needle)
    )
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      const date = sort === 'created' ? 'createdAt' : 'updatedAt'
      return Date.parse(b[date]) - Date.parse(a[date])
    })
}

export function removeArchivedProject(projects, id) {
  return projects.filter(p => p.id !== id || p.status !== 'archived')
}

export function removeUnusedCategory(projects, categories, category) {
  if (!categories.includes(category) || projects.some(p => p.category === category)) return categories
  return categories.filter(c => c !== category)
}

const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function renderShowcaseCards(projects, escapeHTML, getTagColor, labels) {
  return projects
    .map(
      p => `<article>
        <div class="meta"><span class="category">${escapeHTML(p.category)}</span><span class="status status-${escapeHTML(p.status)}">${escapeHTML(labels[p.status])}</span></div>
        <h2>${escapeHTML(p.name)}</h2>
        <p class="description">${escapeHTML(p.description)}</p>
        <div class="tags">${p.tags.map(t => `<small style="--tag-color:${getTagColor(t)}">${escapeHTML(t)}</small>`).join('')}</div>
        ${p.repositories.length ? `<div class="repositories"><h3>Repository references</h3><ul>${p.repositories.map(repository => `<li>${escapeHTML(repository)}</li>`).join('')}</ul></div>` : ''}
      </article>`
    )
    .join('')
}

async function connectShowcase(source, render, escape, color, labels) {
  const grid = document.querySelector('.grid')
  const count = document.querySelector('.project-count')
  const status = document.querySelector('.sync-status')
  try {
    const response = await fetch(source, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw Error('Cannot load projects')
    const data = await response.json()
    if (!Array.isArray(data.projects) || data.projects.length > 10000) throw Error('Invalid feed')
    const projects = data.projects.filter(p => p && p.public === true)
    if (
      projects.some(
        p =>
          !['name', 'description', 'category'].every(key => typeof p[key] === 'string') ||
          !Object.hasOwn(labels, p.status) ||
          !Array.isArray(p.tags) ||
          p.tags.length > 30 ||
          !p.tags.every(t => typeof t === 'string') ||
          !Array.isArray(p.repositories) ||
          !p.repositories.every(r => typeof r === 'string')
      )
    )
      throw Error('Invalid projects')
    grid.innerHTML = render(projects, escape, color, labels) || '<div class="empty">No public projects yet.</div>'
    count.textContent = projects.length.toLocaleString('en') + ' public ' + (projects.length === 1 ? 'project' : 'projects')
    status.textContent = ''
  } catch {
    grid.innerHTML = '<div class="empty">Projects unavailable.</div>'
    count.textContent = 'Projects unavailable'
    status.textContent = 'Could not load live projects. Refresh the page to try again.'
  }
}

export function generateShowcase(projects, title = 'Things I’m building', liveUrl = null) {
  if (liveUrl) {
    const url = new URL(liveUrl)
    const local = ['localhost', '[::1]'].includes(url.hostname) || /^127\.\d+\.\d+\.\d+$/.test(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || !/^\/documents\/[0-9a-f]{64}$/.test(url.pathname)) throw Error('Invalid public feed URL')
  }
  const publicProjects = liveUrl ? [] : projects.filter(p => p.public)
  const cards = renderShowcaseCards(publicProjects, escapeHTML, getTagColor, STATUS_LABELS)
  const script = liveUrl
    ? `<script>(${connectShowcase.toString()})(${JSON.stringify(liveUrl).replaceAll('<', '\\u003c')},${renderShowcaseCards.toString()},${escapeHTML.toString()},${getTagColor.toString()},${JSON.stringify(STATUS_LABELS)})</script>`
    : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>
:root{color-scheme:light;--ink:#2e3a30;--muted:#63705f;--paper:#f8f9f4;--line:#e0e5da;--green:#386449}
*{box-sizing:border-box}
body{font:15px/1.65 system-ui,sans-serif;color:var(--ink);background:var(--paper);margin:0;padding:clamp(20px,4vw,48px)}
main{max-width:1040px;margin:auto}
header{padding:12px 0 28px;margin-bottom:28px;border-bottom:1px solid var(--line)}
.eyebrow{font-size:11px;font-weight:650;letter-spacing:.16em;color:var(--green);margin:0 0 12px}
h1{font-size:clamp(30px,5vw,48px);line-height:1.15;font-weight:600;letter-spacing:-.04em;margin:0 0 16px;overflow-wrap:anywhere}
.intro{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.intro p{margin:0;color:var(--muted)}
.project-count{font-size:12px;color:var(--green);padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:#eef2e9}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}
article{display:flex;flex-direction:column;min-width:0;padding:24px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 3px 12px #263b2805}
.meta{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;font-size:12px}
.category{color:var(--muted);overflow-wrap:anywhere;padding-top:3px}
.status{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;font-size:11px;font-weight:550;padding:3px 8px;border-radius:5px;white-space:nowrap}
.status::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.status-progress{color:#7c5816;background:#fbf0d9}
.status-complete{color:#365c40;background:#edf3e9}
.status-archived{color:#596255;background:#eef0eb}
h2{font-size:21px;line-height:1.3;font-weight:600;letter-spacing:-.025em;margin:18px 0 10px;overflow-wrap:anywhere}
.description{color:var(--muted);margin:0 0 16px;white-space:pre-line;overflow-wrap:anywhere}
.description:empty,.tags:empty{display:none}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}
small{font-size:12px;line-height:1.5;color:var(--tag-color);background:#f4f5ef;background:color-mix(in srgb,var(--tag-color) 8%,white);border:1px solid var(--line);border-color:color-mix(in srgb,var(--tag-color) 20%,white);border-radius:5px;padding:3px 8px;overflow-wrap:anywhere;min-width:0;max-width:100%}
.repositories{margin-top:auto;padding-top:20px;font-size:12px;overflow-wrap:anywhere}
.repositories h3{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.repositories ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.repositories li{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--green);padding:9px 0;border-bottom:1px solid var(--line);white-space:pre-wrap}
.empty{padding:40px 24px;text-align:center;border:1px dashed var(--line);border-radius:10px;color:var(--muted);grid-column:1/-1}
footer{margin-top:28px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
@media(max-width:480px){article{padding:20px}.grid{gap:14px}header{padding-top:4px}}
</style></head><body><main><header><p class="eyebrow">PUBLIC WORKBENCH</p><h1>${escapeHTML(title)}</h1><div class="intro"><p>A few projects from my workbench.</p><span class="project-count">${liveUrl ? 'Loading projects…' : `${publicProjects.length.toLocaleString('en')} public ${publicProjects.length === 1 ? 'project' : 'projects'}`}</span></div></header>${liveUrl ? '<p class="sync-status" role="status">Loading live projects…</p>' : ''}<div class="grid">${cards || `<div class="empty">${liveUrl ? 'Loading live projects…' : 'No public projects yet.'}</div>`}</div><footer>Made with Localist</footer></main>${script}</body></html>`
}
