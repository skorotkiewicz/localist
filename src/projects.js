export const STORAGE_KEY = 'localist.projects.v1'
export const CATEGORIES = ['Rust', 'Bun', 'TypeScript', 'Python', 'Other']
export const STATUS_LABELS = { progress: 'In progress', complete: 'Completed', archived: 'Archived' }

export const demoProjects = [
  { id: '1', name: 'Pocket CLI', path: '~/Dev/Rust/pocket-cli', description: 'A tiny command-line companion for the things I do every day.', category: 'Rust', tags: ['CLI', 'Productivity'], status: 'progress', public: true, icon: 'terminal', updatedAt: '2026-05-21T14:30:00Z' },
  { id: '2', name: 'Bunboard', path: '~/Dev/Bun/bunboard', description: 'A lightweight dashboard for keeping an eye on my self-hosted services.', category: 'Bun', tags: ['Dashboard', 'Self-hosted'], status: 'progress', public: false, icon: 'layout', updatedAt: '2026-05-20T10:00:00Z' },
  { id: '3', name: 'folio', path: '~/Dev/TypeScript/folio', description: 'My little corner of the internet. Projects, writing, and a bit about me.', category: 'TypeScript', tags: ['Website', 'Personal'], status: 'complete', public: true, icon: 'window', updatedAt: '2026-05-19T10:00:00Z' },
  { id: '4', name: 'Moss', path: '~/Dev/Rust/moss', description: 'An experimental, file-based key-value store. Small, fast, and a little green.', category: 'Rust', tags: ['Database', 'Experiment'], status: 'progress', public: true, icon: 'leaf', updatedAt: '2026-05-18T10:00:00Z' },
  { id: '5', name: 'readlater', path: '~/Dev/Bun/readlater', description: 'Save interesting links now. Actually get around to reading them later.', category: 'Bun', tags: ['API', 'Side project'], status: 'progress', public: false, icon: 'bookmark', updatedAt: '2026-05-17T10:00:00Z' },
  { id: '6', name: 'dotfiles', path: '~/Dev/Other/dotfiles', description: 'A familiar setup, wherever I am. My terminal, editor, and shell configs.', category: 'Other', tags: ['Config', 'Tools'], status: 'complete', public: true, icon: 'code', updatedAt: '2026-05-16T10:00:00Z' },
  { id: '7', name: 'Fieldnotes', path: '~/Dev/TypeScript/fieldnotes', description: 'A quiet place to collect ideas, rough notes, and things worth remembering.', category: 'TypeScript', tags: ['Notes', 'Local-first'], status: 'progress', public: false, icon: 'book', updatedAt: '2026-05-15T10:00:00Z' },
  { id: '8', name: 'Image tidy', path: '~/Dev/Python/image-tidy', description: 'A simple script to sort, resize, and make sense of my growing photo library.', category: 'Python', tags: ['Automation', 'Script'], status: 'complete', public: false, icon: 'image', updatedAt: '2026-05-14T10:00:00Z' },
  { id: '9', name: 'weather-ish', path: '~/Dev/Python/weather-ish', description: 'A tiny weather app from a rainy weekend. Keeping it here for a sunny day.', category: 'Python', tags: ['API', 'Learning'], status: 'archived', public: false, icon: 'sun', updatedAt: '2026-05-13T10:00:00Z' },
]

export function validateProjects(value) {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Choose a JSON array with up to 10,000 projects.')
  const ids = new Set()
  return value.map(p => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || ids.has(p.id) ||
      !['name', 'path', 'description', 'category'].every(key => typeof p[key] === 'string' && p[key].length <= 10000) ||
      !p.name.trim() || !p.path.trim() || !p.category.trim() || !Object.hasOwn(STATUS_LABELS, p.status) ||
      typeof p.public !== 'boolean' || !Array.isArray(p.tags) || p.tags.length > 30 || !p.tags.every(t => typeof t === 'string' && t.length <= 100) ||
      typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt))) {
      throw new Error('Invalid project data. Every project needs a unique ID, name, path, category, status, tags, visibility, and update date.')
    }
    ids.add(p.id)
    return { id: p.id, name: p.name, path: p.path, description: p.description, category: p.category, tags: p.tags, status: p.status, public: p.public, updatedAt: p.updatedAt, icon: typeof p.icon === 'string' ? p.icon : 'folder' }
  })
}

export function filterProjects(projects, { status = 'all', category = 'all', query = '', visibility = 'all', sort = 'updated' } = {}) {
  const needle = query.toLowerCase().trim()
  return projects.filter(p => (status === 'all' || p.status === status) && (category === 'all' || p.category === category) &&
    (visibility === 'all' || p.public) && [p.name, p.path, p.description, p.category, ...p.tags].join(' ').toLowerCase().includes(needle))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function generateShowcase(projects, title = 'Things I’m building') {
  const cards = projects.filter(p => p.public).map(p => `<article><div class="meta">${escapeHTML(p.category)} <span>${STATUS_LABELS[p.status]}</span></div><h2>${escapeHTML(p.name)}</h2><p>${escapeHTML(p.description)}</p><div class="tags">${p.tags.map(t => `<small>${escapeHTML(t)}</small>`).join('')}</div></article>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>*{box-sizing:border-box}body{font:15px/1.6 system-ui,sans-serif;color:#283b32;background:#fafbf8;margin:0;padding:32px}main{max-width:1000px;margin:auto}h1{font-size:28px;letter-spacing:-1px}header p{color:#69716b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:16px}article{padding:24px;background:white;border:1px solid #e1e6de;border-radius:12px}h2{font-size:19px;margin:14px 0 8px}article p{color:#626960;min-height:48px}.meta{font-size:12px;color:#477656;display:flex;justify-content:space-between;gap:12px}.meta span{color:#69716b}.tags{display:flex;gap:6px;flex-wrap:wrap}small{background:#f2f4ee;border-radius:4px;padding:2px 7px}footer{margin-top:24px;font-size:12px;color:#69716b}</style></head><body><main><header><h1>${escapeHTML(title)}</h1><p>A few projects from my workbench.</p></header><div class="grid">${cards || '<p>No public projects yet.</p>'}</div><footer>Made with Localist</footer></main></body></html>`
}
