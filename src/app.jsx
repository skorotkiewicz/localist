import { useEffect, useRef, useState } from 'preact/hooks'
import { STATUS_LABELS, removeArchivedProject } from './projects'
import Icon from './componets/Icon'
import ProjectEditor from './componets/ProjectEditor'
import { exportJSON, importJSON } from './helpers/json'
import Sidebar from './componets/Sidebar'
import WorkspaceHeader from './componets/WorkspaceHeader'
import ProjectList from './componets/ProjectList'
import CategoryDialog from './componets/CategoryDialog'
import StorageDialog from './componets/StorageDialog'
import Toast from './componets/Toast'
import ShowcaseDialog from './componets/ShowcaseDialog'
import useProjectIndex from './hooks/useProjectIndex'
import './app.css'

export function App() {
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const searchRef = useRef()
  const importRef = useRef()
  const { projects, categories, counts, loaded, saving, loadError, persist } = useProjectIndex(notify)
  function notify(message) {
    setToast(message)
  }

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 3200)
      return () => clearTimeout(timer)
    }
  }, [toast])

  useEffect(() => {
    const keydown = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setMobileNav(false)
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [])

  async function update(project, changes) {
    if (await persist(projects.map(p => (p.id === project.id ? { ...p, ...changes, updatedAt: new Date().toISOString() } : p)))) notify('Project updated')
  }

  async function remove(project) {
    const next = removeArchivedProject(projects, project.id)
    if (next.length === projects.length) return false
    if (!(await persist(next))) return false
    notify('Project removed')
    return true
  }

  function navigate(next) {
    setStatus(next)
    setCategory('all')
    setMobileNav(false)
  }

  function edit(project = null) {
    setEditing(project)
    setModal('editor')
  }

  async function copy(text, message = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text)
      notify(message)
    } catch {
      notify('Clipboard unavailable. Select and copy the text manually.')
    }
  }

  return (
    <div class="workspace">
      {mobileNav && <button class="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <Sidebar
        mobileNav={mobileNav}
        status={status}
        category={category}
        counts={counts}
        categories={categories}
        projects={projects}
        saving={saving}
        loaded={loaded}
        loadError={loadError}
        navigate={navigate}
        setModal={setModal}
        onCategory={value => {
          setCategory(category === value ? 'all' : value)
          setStatus('all')
          setMobileNav(false)
        }}
      />
      <div class="main-shell">
        <WorkspaceHeader status={status} category={category} setMobileNav={setMobileNav} />
        <main>
          {loadError && (
            <div class="error-banner" role="alert">
              {loadError}
            </div>
          )}
          <section class="page-heading">
            <div>
              <div class="eyebrow">YOUR PERSONAL PROJECT INDEX</div>
              <h1>
                Your ideas. A little more organized<span>.</span>
              </h1>
              <p>A home for everything you’re building, and everything you’ll come back to.</p>
            </div>
            <div class="heading-actions">
              {/* <button class="button export-button" onClick={() => exportJSON({ loaded, projects, categories, notify })}>*/}
              <button class="button export-button" onClick={() => setModal('storage')}>
                <Icon name="download" size={16} />
                Export JSON
              </button>

              <button class="button primary" onClick={() => edit()}>
                <Icon name="plus" size={18} />
                New project
              </button>
            </div>
          </section>
          <section class="stats" aria-label="Project overview">
            {[
              ['all', 'folder', 'Total projects', 'Everything in your workspace'],
              ['progress', 'progress', 'In progress', 'Ideas taking shape'],
              ['complete', 'circleCheck', 'Completed', 'Built, shipped, and done'],
              ['archived', 'archive', 'Archived', 'On the shelf, not forgotten']
            ].map(([key, icon, label, caption]) => (
              <button class={`stat-card stat-${key}`} key={key} onClick={() => navigate(key)}>
                <div class="stat-top">
                  <span>{label}</span>
                  <span class="stat-icon">
                    <Icon name={icon} size={18} />
                  </span>
                </div>
                <strong>{counts[key].toString().padStart(2, '0')}</strong>
                <small>{caption}</small>
              </button>
            ))}
          </section>
          <ProjectList
            projects={projects}
            categories={categories}
            loaded={loaded}
            loadError={loadError}
            status={status}
            category={category}
            setCategory={setCategory}
            searchRef={searchRef}
            copy={copy}
            onEdit={edit}
            onUpdate={update}
            onRemove={remove}
          />
          {/* <section class="showcase-banner">
            <div class="banner-icon">
              <Icon name="globe" size={24} />
              <span class="mini-spark">
                <Icon name="spark" size={16} />
              </span>
            </div>
            <div>
              <h3>Keep it local. Share what you love.</h3>
              <p>Turn your public projects into a little showcase for your website or blog.</p>
            </div>
            <button class="button" onClick={() => setModal('showcase')}>
              Build your showcase
              <Icon name="arrow" size={16} />
            </button>
          </section>*/}
        </main>
      </div>
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => importJSON(e, { projects, categories, persist, notify, setModal })} />
      {modal === 'editor' && (
        <ProjectEditor
          project={editing}
          categories={categories}
          close={() => setModal(null)}
          save={async p => {
            if (await persist(editing ? projects.map(old => (old.id === p.id ? p : old)) : [p, ...projects])) {
              setModal(null)
              notify(editing ? 'Changes saved' : 'Project added. Make something good.')
            }
          }}
        />
      )}
      <CategoryDialog
        open={modal === 'category'}
        projects={projects}
        categories={categories}
        persist={persist}
        onCreated={value => {
          setCategory(value)
          setStatus('all')
        }}
        close={() => setModal(null)}
      />
      {modal === 'storage' && <StorageDialog projects={projects} categories={categories} loaded={loaded} notify={notify} importRef={importRef} close={() => setModal(null)} />}
      <ShowcaseDialog open={modal === 'showcase'} projects={projects} notify={notify} copy={copy} close={() => setModal(null)} />
      {toast && <Toast message={toast} dismiss={() => setToast('')} />}
    </div>
  )
}
