import { useEffect, useRef, useState } from 'preact/hooks'
import { CATEGORIES, STATUS_LABELS, STORAGE_KEY, demoProjects, filterProjects, generateShowcase, validateProjects } from './projects'
import './app.css'

const paths = {
  folder: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  progress: 'M12 3a9 9 0 1 1-9 9 M12 3v4 M12 12l4-4',
  check: 'm5 12 4 4L19 6', circleCheck: 'M21 11v1a9 9 0 1 1-5.3-8.2 M9 11l3 3L22 4',
  archive: 'M3 3h18v5H3z M5 8v13h14V8 M10 12h4',
  plus: 'M12 5v14 M5 12h14', search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  chevron: 'm8 10 4 4 4-4', arrow: 'M5 12h14 m-5-5 5 5-5 5',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  lock: 'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3', download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  upload: 'M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5', close: 'm6 6 12 12 M6 18 18 6',
  terminal: 'm5 7 5 5-5 5 M13 17h6', layout: 'M3 4h18v16H3z M3 9h18 M9 9v11',
  window: 'M3 4h18v16H3z M3 9h18 M6 6.5h.1 M9 6.5h.1 M12 6.5h.1',
  leaf: 'M20 3c1 9-2 17-10 17a7 7 0 0 1-7-7C3 5 12 6 20 3Z M4 21 15 10',
  bookmark: 'M6 3h12v18l-6-4-6 4Z', code: 'm8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
  book: 'M4 3h15v18H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3 M3 17h16 M7 7h8 M7 10h6',
  image: 'M3 3h18v18H3z m0 14 6-6 7 10 M14 17l3-4 4 4 M16 7h.1',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1',
  copy: 'M9 9h12v12H9z M15 9V3H3v12h6', list: 'M8 5h13 M8 12h13 M8 19h13 M3 5h.1 M3 12h.1 M3 19h.1',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  storage: 'M3 5h18v14H3z M3 14h18 M6 17h.1 M9 17h.1', spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4 M12 17h.1',
}
function Icon({ name, size = 18, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.folder} /></svg>
}
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function Modal({ title, subtitle, close, children, wide }) {
  const ref = useRef()
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    const onCancel = e => { e.preventDefault(); close() }
    dialog.addEventListener('cancel', onCancel)
    return () => dialog.removeEventListener('cancel', onCancel)
  }, [])
  return <dialog ref={ref} class={`modal ${wide ? 'wide' : ''}`} onClick={e => { if (e.target === ref.current) close() }}>
    <div class="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button class="icon-button" aria-label="Close dialog" onClick={close}><Icon name="close" /></button></div>{children}
  </dialog>
}
const emptyProject = { name: '', path: '', description: '', category: 'Rust', tags: [], status: 'progress', public: false, icon: 'folder' }
function ProjectEditor({ project, categories, save, close }) {
  const [draft, setDraft] = useState(project || emptyProject)
  const [tagText, setTagText] = useState(project?.tags.join(', ') || '')
  const field = (key, value) => setDraft({ ...draft, [key]: value })
  return <Modal title={project ? 'Edit project' : 'A new place to start.'} subtitle="Keep the details here. Pick up where you left off." close={close}>
    <form onSubmit={e => { e.preventDefault(); save({ ...draft, tags: tagText.split(',').map(t => t.trim().slice(0, 100)).filter(Boolean).slice(0, 30), name: draft.name.trim(), path: draft.path.trim(), category: draft.category.trim(), id: draft.id || crypto.randomUUID(), updatedAt: new Date().toISOString() }) }}>
      <label>Project name<input required maxLength={120} value={draft.name} onInput={e => field('name', e.target.value)} placeholder="My next good idea" autoFocus /></label>
      <label>Local path<input required maxLength={500} value={draft.path} onInput={e => field('path', e.target.value)} placeholder="~/Dev/Rust/my-project" class="mono" /><small>A reference to your folder. Localist does not access your files.</small></label>
      <label>Description<textarea rows="3" maxLength={2000} value={draft.description} onInput={e => field('description', e.target.value)} placeholder="What are you making?" /></label>
      <div class="form-row"><label>Category<select value={draft.category} onChange={e => field('category', e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Status<select value={draft.status} onChange={e => field('status', e.target.value)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      <label>Tags<input value={tagText} onInput={e => setTagText(e.target.value)} placeholder="CLI, Tools, Side project" /><small>Separate tags with commas.</small></label>
      <label class="visibility-setting"><Icon name="globe" size={22} /><span>Make it public<small>Include this project in your showcase. Paths stay private.</small></span><input type="checkbox" checked={draft.public} onChange={e => field('public', e.target.checked)} /></label>
      <div class="modal-footer"><button type="button" class="button" onClick={close}>Cancel</button><button class="button primary" type="submit"><Icon name="check" />{project ? 'Save changes' : 'Add project'}</button></div>
    </form>
  </Modal>
}

export function App() {
  const [loadError, setLoadError] = useState('')
  const [projects, setProjects] = useState(() => {
    try { const stored = localStorage.getItem(STORAGE_KEY); return stored ? validateProjects(JSON.parse(stored)) : demoProjects }
    catch { setTimeout(() => setLoadError('Saved data could not be read. It has not been overwritten. Export JSON to recover the original data, fix the file, and reload before making changes.'), 0); return demoProjects }
  })
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [visibility, setVisibility] = useState('all')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState('grid')
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [menu, setMenu] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [extraCategories, setExtraCategories] = useState([])
  const [newCategory, setNewCategory] = useState('')
  const [showcaseTitle, setShowcaseTitle] = useState('Things I’m building')
  const searchRef = useRef()
  const importRef = useRef()
  const categories = [...new Set([...CATEGORIES, ...projects.map(p => p.category), ...extraCategories])]
  const counts = { all: projects.length, ...Object.fromEntries(Object.keys(STATUS_LABELS).map(s => [s, projects.filter(p => p.status === s).length])) }
  const filtered = filterProjects(projects, { status, category, query, visibility, sort })
  const publicCount = projects.filter(p => p.public).length
  const html = modal === 'showcase' ? generateShowcase(projects, showcaseTitle) : ''
  function notify(message) { setToast(message) }
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer) } }, [toast])
  useEffect(() => {
    const keydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus() } if (e.key === 'Escape') { setMenu(null); setMobileNav(false) } }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [])
  useEffect(() => {
    if (!menu) return
    const closeMenu = e => { if (!e.target.closest('.card-menu')) setMenu(null) }
    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [menu])
  function persist(next) {
    if (loadError) { notify('Resolve the saved-data error before making changes.'); return false }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setProjects(next); return true }
    catch { notify('Storage is full or unavailable. Export your JSON before leaving.'); return false }
  }
  function update(project, changes) { if (persist(projects.map(p => p.id === project.id ? { ...p, ...changes, updatedAt: new Date().toISOString() } : p))) notify('Project updated'); setMenu(null) }
  function navigate(next) { setStatus(next); setCategory('all'); setMobileNav(false) }
  function edit(project = null) { setEditing(project); setMenu(null); setModal('editor') }
  async function copy(text, message = 'Copied to clipboard') { try { await navigator.clipboard.writeText(text); notify(message) } catch { notify('Clipboard unavailable. Select and copy the text manually.') } }
  function exportJSON() {
    if (loadError) {
      try { download(localStorage.getItem(STORAGE_KEY) || '', 'projects-recovery.json', 'application/json'); notify('Original saved data exported for recovery') }
      catch { notify('Browser storage cannot be read. Check your browser permissions.') }
      return
    }
    download(JSON.stringify(projects, null, 2), 'projects.json', 'application/json'); notify('Project index exported')
  }
  async function importJSON(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      if (file.size > 10000000) throw new Error('Choose a JSON file smaller than 10 MB.')
      const incoming = validateProjects(JSON.parse(await file.text()))
      const map = new Map(projects.map(p => [p.id, p])); incoming.forEach(p => map.set(p.id, p))
      if (persist([...map.values()])) { notify(`Imported ${incoming.length} projects`); setModal(null) }
    } catch (error) { notify(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message) }
    e.target.value = ''
  }
  return <div class="workspace">
    {mobileNav && <button class="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside class={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <a class="brand" href="#" onClick={e => { e.preventDefault(); navigate('all') }}><span class="brand-mark"><Icon name="folder" size={23} /></span>localist<span class="brand-dot">.</span></a>
      <div class="workspace-switch"><span class="workspace-avatar">M</span><div>My workspace<small>Personal space</small></div><Icon name="lock" size={15} /></div>
      <div class="nav-label">WORKSPACE</div>
      <nav class="main-nav" aria-label="Project status">{[['all', 'grid', 'All projects'], ['progress', 'progress', 'In progress'], ['complete', 'circleCheck', 'Completed'], ['archived', 'archive', 'Archived']].map(([key, icon, label]) => <button key={key} class={`nav-item ${status === key && category === 'all' ? 'active' : ''}`} onClick={() => navigate(key)} aria-current={status === key && category === 'all' ? 'page' : undefined}><Icon name={icon} /><span>{label}</span><span class="nav-count">{counts[key]}</span></button>)}</nav>
      <div class="nav-label category-label">CATEGORIES <button class="tiny-button" aria-label="Add category" onClick={() => setModal('category')}><Icon name="plus" size={15} /></button></div>
      <nav class="category-nav" aria-label="Project categories">{categories.map(c => <button class={`nav-item ${category === c ? 'category-active' : ''}`} key={c} onClick={() => { setCategory(category === c ? 'all' : c); setStatus('all'); setMobileNav(false) }}><span class={`category-dot ${CATEGORIES.includes(c) ? c.toLowerCase() : 'other'}`} /><span>{c}</span><span class="category-count">{projects.filter(p => p.category === c).length}</span></button>)}</nav>
      <button class="nav-item showcase-nav" onClick={() => setModal('showcase')}><Icon name="globe" /><span>Public showcase</span><Icon name="arrow" size={15} /></button>
      <div class="sidebar-bottom"><div class="share-card"><span class="share-icon"><Icon name="spark" size={20} /></span><h3>Made to be shared.</h3><p>Your projects deserve a little<br />corner of the internet.</p><button onClick={() => setModal('showcase')}>Create your showcase <Icon name="arrow" size={15} /></button><span class="share-decoration" aria-hidden="true"><Icon name="spark" size={100} /></span></div>
      <button class="storage-button" onClick={() => setModal('storage')}><span class="storage-led" /><span>Stored locally<small>Your data stays yours.</small></span><Icon name="settings" size={16} /></button></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-toggle" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="list" /></button><Icon name="folder" size={16} /><span>My workspace</span><span class="slash">/</span><strong>{category !== 'all' ? category : status === 'all' ? 'All projects' : STATUS_LABELS[status]}</strong></div><div class="topbar-right"><span class="local-badge"><span />Local-first. Always.</span><button class="icon-button help-button" aria-label="About local storage" onClick={() => setModal('storage')}><Icon name="help" size={19} /></button><span class="profile-avatar" title="Personal workspace">M</span></div></header>
      <main>
        {loadError && <div class="error-banner" role="alert">{loadError}</div>}
        <section class="page-heading"><div><div class="eyebrow">YOUR PERSONAL PROJECT INDEX</div><h1>Your ideas. A little more organized<span>.</span></h1><p>A home for everything you’re building, and everything you’ll come back to.</p></div><div class="heading-actions"><button class="button export-button" onClick={exportJSON}><Icon name="download" size={16} />Export JSON</button><button class="button primary" onClick={() => edit()}><Icon name="plus" size={18} />New project</button></div></section>
        <section class="stats" aria-label="Project overview">{[['all', 'folder', 'Total projects', 'Everything in your workspace'], ['progress', 'progress', 'In progress', 'Ideas taking shape'], ['complete', 'circleCheck', 'Completed', 'Built, shipped, and done'], ['archived', 'archive', 'Archived', 'On the shelf, not forgotten']].map(([key, icon, label, caption]) => <button class={`stat-card stat-${key}`} key={key} onClick={() => navigate(key)}><div class="stat-top"><span>{label}</span><span class="stat-icon"><Icon name={icon} size={18} /></span></div><strong>{counts[key].toString().padStart(2, '0')}</strong><small>{caption}</small></button>)}</section>
        <section class="projects-section"><div class="section-heading"><h2>{category !== 'all' ? `${category} projects` : status === 'all' ? 'All projects' : STATUS_LABELS[status]} <span>{filtered.length}</span></h2><div class="view-toggle" aria-label="Project view"><button class={view === 'grid' ? 'selected' : ''} onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}><Icon name="grid" size={16} /></button><button class={view === 'list' ? 'selected' : ''} onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'}><Icon name="list" size={17} /></button></div></div>
          <div class="toolbar"><div class="search-box"><Icon name="search" size={18} /><input ref={searchRef} value={query} onInput={e => setQuery(e.target.value)} placeholder="Find a project, path, or tag..." aria-label="Search projects" /><kbd>⌘ K</kbd></div><div class="filters"><div class="select-wrap"><Icon name="folder" size={15} /><select aria-label="Filter category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select><Icon name="chevron" size={13} /></div><div class="select-wrap"><Icon name="globe" size={15} /><select aria-label="Filter visibility" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="all">All visibility</option><option value="public">Public only</option></select><Icon name="chevron" size={13} /></div><div class="sort-wrap"><span>Sort:</span><select aria-label="Sort projects" value={sort} onChange={e => setSort(e.target.value)}><option value="updated">Last updated</option><option value="name">Name A to Z</option></select><Icon name="chevron" size={13} /></div></div></div>
          <div class={`project-grid ${view === 'list' ? 'list-view' : ''}`}>
            {filtered.map(p => <article class={`project-card ${p.status === 'archived' ? 'archived-card' : ''}`} key={p.id}>
              <div class="card-top"><span class={`project-icon color-${p.category.toLowerCase().replace(/[^a-z]/g, '')}`}><Icon name={p.icon} size={24} /></span><div class="card-top-actions"><button class={`visibility-button ${p.public ? 'is-public' : ''}`} title={p.public ? 'Public project. Click to make private.' : 'Private project. Click to make public.'} aria-label={`${p.name}: ${p.public ? 'make private' : 'make public'}`} onClick={() => update(p, { public: !p.public })}><Icon name={p.public ? 'globe' : 'lock'} size={14} /><span>{p.public ? 'Public' : 'Private'}</span></button><div class="card-menu"><button class="more-button" aria-label={`Actions for ${p.name}`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>···</button>{menu === p.id && <div class="dropdown"><button onClick={() => edit(p)}><Icon name="code" size={15} />Edit project</button><button onClick={() => { copy(p.path, 'Project path copied'); setMenu(null) }}><Icon name="copy" size={15} />Copy path</button><button onClick={() => update(p, { status: p.status === 'complete' ? 'progress' : 'complete' })}><Icon name="circleCheck" size={15} />{p.status === 'complete' ? 'Mark as in progress' : 'Mark as completed'}</button><button onClick={() => update(p, { status: p.status === 'archived' ? 'progress' : 'archived' })}><Icon name="archive" size={15} />{p.status === 'archived' ? 'Unarchive project' : 'Archive project'}</button></div>}</div></div></div>
              <div class="project-info"><h3><button onClick={() => edit(p)}>{p.name}</button></h3><button class="path-button" title="Copy project path" onClick={() => copy(p.path, 'Project path copied')}><Icon name="folder" size={12} /><span>{p.path}</span><Icon name="copy" size={12} class="copy-icon" /></button><p class="project-description">{p.description || 'A new idea, waiting to take shape.'}</p><div class="tags"><button class={`tag language-tag ${CATEGORIES.includes(p.category) ? p.category.toLowerCase() : 'other'}`} onClick={() => setCategory(p.category)}><span />{p.category}</button>{p.tags.slice(0, 2).map(t => <button class="tag" key={t} onClick={() => setQuery(t)}>{t}</button>)}</div></div>
              <div class="card-footer"><button class={`status-badge status-${p.status}`} onClick={() => update(p, { status: p.status === 'progress' ? 'complete' : 'progress' })} title={p.status === 'progress' ? 'Mark as completed' : 'Move to in progress'}><Icon name={p.status === 'complete' ? 'circleCheck' : p.status === 'archived' ? 'archive' : 'progress'} size={13} />{STATUS_LABELS[p.status]}</button><span>Updated {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(p.updatedAt))}</span></div>
            </article>)}
          </div>
          {!filtered.length && <div class="empty-state"><Icon name="search" size={32} /><h3>No projects here. Yet.</h3><p>{query || category !== 'all' || visibility !== 'all' ? 'Try a different search or clear your filters.' : 'Add a project and give your next idea a home.'}</p><button class="button" onClick={() => { if (query || category !== 'all' || visibility !== 'all') { setQuery(''); setCategory('all'); setVisibility('all') } else edit() }}>{query || category !== 'all' || visibility !== 'all' ? 'Clear filters' : 'Add project'}</button></div>}
          <footer class="index-footer"><span>Showing {filtered.length} of {projects.length} projects</span><span><Icon name="lock" size={12} />Just you, your projects, and a little clarity.</span></footer>
        </section>
        <section class="showcase-banner"><div class="banner-icon"><Icon name="globe" size={24} /><span class="mini-spark"><Icon name="spark" size={16} /></span></div><div><h3>Keep it local. Share what you love.</h3><p>Turn your public projects into a little showcase for your website or blog.</p></div><button class="button" onClick={() => setModal('showcase')}>Build your showcase<Icon name="arrow" size={16} /></button></section>
        <div class="page-footer"><span>A little less scattered. A little more built.</span><span>Made for the work in progress.<span class="footer-spark"><Icon name="spark" size={14} /></span></span></div>
      </main>
    </div>
    <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importJSON} />
    {modal === 'editor' && <ProjectEditor project={editing} categories={categories} close={() => setModal(null)} save={p => { if (persist(editing ? projects.map(old => old.id === p.id ? p : old) : [p, ...projects])) { setModal(null); notify(editing ? 'Changes saved' : 'Project added. Make something good.'); } }} />}
    {modal === 'category' && <Modal title="A place for something else." subtitle="Add a category for your next kind of project." close={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); const value = newCategory.trim(); if (value && !categories.includes(value)) setExtraCategories([...extraCategories, value]); setCategory(value); setStatus('all'); setNewCategory(''); setModal(null) }}><label>Category name<input required maxLength={60} value={newCategory} onInput={e => setNewCategory(e.target.value)} placeholder="e.g. Go, Design, Weekend ideas" autoFocus /></label><p class="form-note">Categories are saved with the projects that use them.</p><div class="modal-footer"><button type="button" class="button" onClick={() => setModal(null)}>Cancel</button><button class="button primary">Add category</button></div></form></Modal>}
    {modal === 'storage' && <Modal title="Local by design." subtitle="No account. No cloud. Your project index lives in this browser." close={() => setModal(null)}><div class="storage-detail"><Icon name="storage" size={30} /><div><strong>{projects.length} projects, one simple JSON file.</strong><p>Export a backup to keep on your computer or move to another browser. Import merges projects by ID without removing other projects.</p></div></div><div class="notice"><Icon name="lock" size={18} /><p>Clearing browser data removes your local index. Export regularly. JSON backups include private projects and local paths.</p></div><div class="storage-actions"><button class="button" onClick={() => importRef.current.click()}><Icon name="upload" size={16} />Import JSON</button><button class="button primary" onClick={exportJSON}><Icon name="download" size={16} />Export projects.json</button></div></Modal>}
    {modal === 'showcase' && <Modal title="A little corner of the internet." subtitle={`${publicCount} public projects. No private projects or local paths, ever.`} close={() => setModal(null)} wide><label>Showcase title<input value={showcaseTitle} onInput={e => setShowcaseTitle(e.target.value)} maxLength={150} /></label><div class="preview-label"><span>LIVE PREVIEW</span><span><Icon name="globe" size={13} />Public projects only</span></div><iframe class="showcase-preview" title="Public project showcase preview" srcDoc={html} sandbox="" /><div class="notice"><Icon name="code" size={19} /><p>Download the HTML and host it on your website. Then copy the embed code. Re-export when your projects change.</p></div><div class="embed-code"><code>{'<iframe src="/showcase.html" title="My projects" width="100%" height="600" style="border:0" loading="lazy"></iframe>'}</code><button class="icon-button" aria-label="Copy embed code" onClick={() => copy('<iframe src="/showcase.html" title="My projects" width="100%" height="600" style="border:0" loading="lazy"></iframe>')}><Icon name="copy" size={17} /></button></div><div class="modal-footer"><span class="public-count"><Icon name="globe" size={14} />{publicCount} public projects</span><button class="button primary" onClick={() => { download(html, 'showcase.html', 'text/html'); notify('Your public showcase is ready') }}><Icon name="download" size={16} />Download showcase</button></div></Modal>}
    {toast && <div class="toast" role="status"><span><Icon name="check" size={16} /></span>{toast}<button class="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" size={15} /></button></div>}
  </div>
}
