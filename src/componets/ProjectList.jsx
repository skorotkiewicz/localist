import { useEffect, useState } from 'preact/hooks'
import { STATUS_LABELS, filterProjects } from '../projects'
import Icon from './Icon'
import ProjectCard from './ProjectCard'

export default function ProjectList({ projects, categories, loaded, loadError, status, category, setCategory, searchRef, copy, onEdit, onUpdate }) {
  const [query, setQuery] = useState('')
  const [visibility, setVisibility] = useState('all')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState('grid')
  const [menu, setMenu] = useState(null)
  const filtered = filterProjects(projects, { status, category, query, visibility, sort })

  useEffect(() => {
    if (!menu) return
    const closeMenu = e => {
      if (!e.target.closest('.card-menu')) setMenu(null)
    }
    const keydown = e => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('click', closeMenu)
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('click', closeMenu)
      document.removeEventListener('keydown', keydown)
    }
  }, [menu])

  function edit(project = null) {
    setMenu(null)
    onEdit(project)
  }

  async function update(project, changes) {
    await onUpdate(project, changes)
    setMenu(null)
  }

  return (
    <section class="projects-section">
      <div class="section-heading">
        <h2>
          {category !== 'all' ? `${category} projects` : status === 'all' ? 'All projects' : STATUS_LABELS[status]} <span>{filtered.length}</span>
        </h2>
        <div class="view-toggle" aria-label="Project view">
          <button class={view === 'grid' ? 'selected' : ''} onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}>
            <Icon name="grid" size={16} />
          </button>
          <button class={view === 'list' ? 'selected' : ''} onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'}>
            <Icon name="list" size={17} />
          </button>
        </div>
      </div>
      <div class="toolbar">
        <div class="search-box">
          <Icon name="search" size={18} />
          <input ref={searchRef} value={query} onInput={e => setQuery(e.target.value)} placeholder="Find a project, path, or tag..." aria-label="Search projects" />
          <kbd>⌘ K</kbd>
        </div>
        <div class="filters">
          <div class="select-wrap">
            <Icon name="folder" size={15} />
            <select aria-label="Filter category" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <Icon name="chevron" size={13} />
          </div>
          <div class="select-wrap">
            <Icon name="globe" size={15} />
            <select aria-label="Filter visibility" value={visibility} onChange={e => setVisibility(e.target.value)}>
              <option value="all">All visibility</option>
              <option value="public">Public only</option>
            </select>
            <Icon name="chevron" size={13} />
          </div>
          <div class="sort-wrap">
            <span>Sort:</span>
            <select aria-label="Sort projects" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="updated">Last updated</option>
              <option value="name">Name A to Z</option>
            </select>
            <Icon name="chevron" size={13} />
          </div>
        </div>
      </div>
      <div class={`project-grid ${view === 'list' ? 'list-view' : ''}`}>
        {filtered.map(p => (
          <ProjectCard key={p.id} project={p} menu={menu} setMenu={setMenu} update={update} edit={edit} copy={copy} setCategory={setCategory} setQuery={setQuery} />
        ))}
      </div>
      {!filtered.length && !loaded && !loadError && (
        <div class="empty-state" role="status">
          <Icon name="storage" size={32} />
          <p>Loading your project index…</p>
        </div>
      )}
      {!filtered.length && loaded && (
        <div class="empty-state">
          <Icon name="search" size={32} />
          <h3>No projects here. Yet.</h3>
          <p>{query || category !== 'all' || visibility !== 'all' ? 'Try a different search or clear your filters.' : 'Add a project and give your next idea a home.'}</p>
          <button
            class="button"
            onClick={() => {
              if (query || category !== 'all' || visibility !== 'all') {
                setQuery('')
                setCategory('all')
                setVisibility('all')
              } else edit()
            }}
          >
            {query || category !== 'all' || visibility !== 'all' ? 'Clear filters' : 'Add project'}
          </button>
        </div>
      )}
      <footer class="index-footer">
        <span>
          Showing {filtered.length} of {projects.length} projects
        </span>
        <span>
          <Icon name="lock" size={12} />
          Just you, your projects, and a little clarity.
        </span>
      </footer>
    </section>
  )
}
