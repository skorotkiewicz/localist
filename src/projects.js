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

export function generateShowcase(projects, title = 'Things I’m building') {
  const cards = projects
    .filter(p => p.public)
    .map(
      p =>
        `<article><div class="meta">${escapeHTML(p.category)} <span>${STATUS_LABELS[p.status]}</span></div><h2>${escapeHTML(p.name)}</h2><p>${escapeHTML(p.description)}</p><div class="tags">${p.tags.map(t => `<small>${escapeHTML(t)}</small>`).join('')}</div>${p.repositories.length ? `<div class="repositories">${p.repositories.map(repository => `<div>${escapeHTML(repository)}</div>`).join('')}</div>` : ''}</article>`
    )
    .join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>*{box-sizing:border-box}body{font:15px/1.6 system-ui,sans-serif;color:#283b32;background:#fafbf8;margin:0;padding:32px}main{max-width:1000px;margin:auto}h1{font-size:28px;letter-spacing:-1px}header p{color:#69716b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:16px}article{padding:24px;background:white;border:1px solid #e1e6de;border-radius:12px}h2{font-size:19px;margin:14px 0 8px}article p{color:#626960;min-height:48px}.meta{font-size:12px;color:#477656;display:flex;justify-content:space-between;gap:12px}.meta span{color:#69716b}.tags{display:flex;gap:6px;flex-wrap:wrap}.repositories{font-size:12px;color:#477656;margin-top:12px;overflow-wrap:anywhere}small{background:#f2f4ee;border-radius:4px;padding:2px 7px}footer{margin-top:24px;font-size:12px;color:#69716b}</style></head><body><main><header><h1>${escapeHTML(title)}</h1><p>A few projects from my workbench.</p></header><div class="grid">${cards || '<p>No public projects yet.</p>'}</div><footer>Made with Localist</footer></main></body></html>`
}
