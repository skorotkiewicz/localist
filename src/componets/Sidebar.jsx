import Icon from './Icon'

export default function Sidebar({ mobileNav, status, category, counts, categories, projects, saving, loaded, loadError, navigate, setModal, onCategory }) {
  return (
    <aside class={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <a
        class="brand"
        href="#"
        onClick={e => {
          e.preventDefault()
          navigate('all')
        }}
      >
        <span class="brand-mark">
          <Icon name="folder" size={23} />
        </span>
        localist<span class="brand-dot">.</span>
      </a>
      <div class="workspace-switch">
        <span class="workspace-avatar">M</span>
        <div>
          My workspace<small>Personal space</small>
        </div>
        <Icon name="lock" size={15} />
      </div>
      <div class="nav-label">WORKSPACE</div>
      <nav class="main-nav" aria-label="Project status">
        {[
          ['all', 'grid', 'All projects'],
          ['progress', 'progress', 'In progress'],
          ['complete', 'circleCheck', 'Completed'],
          ['archived', 'archive', 'Archived']
        ].map(([key, icon, label]) => (
          <button key={key} class={`nav-item ${status === key && category === 'all' ? 'active' : ''}`} onClick={() => navigate(key)} aria-current={status === key && category === 'all' ? 'page' : undefined}>
            <Icon name={icon} />
            <span>{label}</span>
            <span class="nav-count">{key === 'all' ? counts.all - counts.archived : counts[key]}</span>
          </button>
        ))}
      </nav>
      <div class="nav-label category-label">
        CATEGORIES{' '}
        <button class="tiny-button" aria-label="Add category" onClick={() => setModal('category')}>
          <Icon name="plus" size={15} />
        </button>
      </div>
      <nav class="category-nav" aria-label="Project categories">
        {categories.map(c => (
          <button class={`nav-item ${category === c ? 'category-active' : ''}`} key={c} onClick={() => onCategory(c)}>
            <span class="category-dot" />
            <span>{c}</span>
            <span class="category-count">{projects.filter(p => p.category === c && p.status !== 'archived').length}</span>
          </button>
        ))}
      </nav>
      <button class="nav-item showcase-nav" onClick={() => setModal('showcase')}>
        <Icon name="globe" />
        <span>Public showcase</span>
        <Icon name="arrow" size={15} />
      </button>
      <div class="sidebar-bottom">

        <div class="share-card">
          <span class="share-icon">
            <Icon name="spark" size={20} />
          </span>
          <h3>Made to be shared.</h3>
          <p>
            Your projects deserve a little
            <br />
            corner of the internet.
          </p>
          <button onClick={() => setModal('showcase')}>
            Create your showcase <Icon name="arrow" size={15} />
          </button>
          <span class="share-decoration" aria-hidden="true">
            <Icon name="spark" size={100} />
          </span>
        </div>

        <button class="storage-button" onClick={() => setModal('storage')}>
          <span class="storage-led" />
          <span>
            {saving ? 'Saving to JSON…' : loaded ? 'Saved to projects.json' : 'JSON index'}
            <small>{loadError ? 'Could not load index.' : 'Your data stays yours.'}</small>
          </span>
          <Icon name="settings" size={16} />
        </button>
      </div>
    </aside>
  )
}
