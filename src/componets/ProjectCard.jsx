import { STATUS_LABELS } from '../projects'
import Icon from './Icon'
import ProjectDescription from './ProjectDescription'

export default function ProjectCard({ project: p, menu, setMenu, update, edit, copy, setCategory, setQuery }) {
  const repositories = p.repositories ?? []
  return (
    <article class={`project-card ${p.status === 'archived' ? 'archived-card' : ''}`}>
      <div class="card-top">
        <span class={`project-icon color-${p.category.toLowerCase().replace(/[^a-z]/g, '')}`}>
          <Icon name={p.icon} size={24} />
        </span>
        <div class="card-top-actions">
          <button
            class={`visibility-button ${p.public ? 'is-public' : ''}`}
            title={p.public ? 'Public project. Click to make private.' : 'Private project. Click to make public.'}
            aria-label={`${p.name}: ${p.public ? 'make private' : 'make public'}`}
            onClick={() => update(p, { public: !p.public })}
          >
            <Icon name={p.public ? 'globe' : 'lock'} size={14} />
            <span>{p.public ? 'Public' : 'Private'}</span>
          </button>
          <div class="card-menu">
            <button class="more-button" aria-label={`Actions for ${p.name}`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>
              ···
            </button>
            {menu === p.id && (
              <div class="dropdown">
                <button onClick={() => edit(p)}>
                  <Icon name="code" size={15} />
                  Edit project
                </button>
                <button
                  onClick={() => {
                    copy(p.path, 'Project path copied')
                    setMenu(null)
                  }}
                >
                  <Icon name="copy" size={15} />
                  Copy path
                </button>
                {repositories.map((repository, index) => (
                  <button
                    class="repository-copy"
                    key={index}
                    title={`Copy repository: ${repository}`}
                    onClick={() => {
                      copy(repository, 'Repository URL copied')
                      setMenu(null)
                    }}
                  >
                    <Icon name="copy" size={15} />
                    <span>{repository}</span>
                  </button>
                ))}
                <button
                  onClick={() =>
                    update(p, {
                      status: p.status === 'complete' ? 'progress' : 'complete'
                    })
                  }
                >
                  <Icon name="circleCheck" size={15} />
                  {p.status === 'complete' ? 'Mark as in progress' : 'Mark as completed'}
                </button>
                <button
                  onClick={() =>
                    update(p, {
                      status: p.status === 'archived' ? 'progress' : 'archived'
                    })
                  }
                >
                  <Icon name="archive" size={15} />
                  {p.status === 'archived' ? 'Unarchive project' : 'Archive project'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div class="project-info">
        <h3>
          <button title={p.name} onClick={() => edit(p)}>
            {p.name}
          </button>
        </h3>
        <div class="project-paths">
          <button class="path-button" title="Copy project path" onClick={() => copy(p.path, 'Project path copied')}>
            <Icon name="folder" size={12} />
            <span>{p.path}</span>
            <Icon name="copy" size={12} class="copy-icon" />
          </button>
          {repositories.length > 0 && (
            <button class="path-button card-menu repository-trigger" title={repositories.join('\n')} aria-label={`Repository URLs for ${p.name}`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>
              <Icon name="code" size={12} />
              <span>{repositories.length}</span>
            </button>
          )}
        </div>
        {p.description && <ProjectDescription description={p.description} />}
        {/* {p.description ? <ProjectDescription description={p.description} /> : <p class="project-description">A new idea, waiting to take shape.</p> }*/}
        <div class="tags">
          <button class="tag language-tag other" title={p.category} onClick={() => setCategory(p.category)}>
            <span />
            {p.category}
          </button>
          {p.tags.slice(0, 2).map(t => (
            <button class="tag" key={t} title={t} onClick={() => setQuery(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div class="card-footer">
        <button class={`status-badge status-${p.status}`} onClick={() => update(p, { status: p.status === 'progress' ? 'complete' : 'progress' })} title={p.status === 'progress' ? 'Mark as completed' : 'Move to in progress'}>
          <Icon name={p.status === 'complete' ? 'circleCheck' : p.status === 'archived' ? 'archive' : 'progress'} size={13} />
          {STATUS_LABELS[p.status]}
        </button>
        <span>Updated {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(p.updatedAt))}</span>
      </div>
    </article>
  )
}
