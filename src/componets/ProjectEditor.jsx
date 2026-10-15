import { useState } from 'preact/hooks'
import { STATUS_LABELS } from '../projects'
import Icon from './Icon'
import Modal from './Modal'

const emptyProject = {
  name: '',
  path: '',
  description: '',
  category: '',
  tags: [],
  status: 'progress',
  public: false,
  icon: 'folder'
}

function ProjectEditor({ project, categories, save, close }) {
  const [draft, setDraft] = useState(project || emptyProject)
  const [tagText, setTagText] = useState(project?.tags.join(', ') || '')
  const [repositoryText, setRepositoryText] = useState(project?.repositories?.join('\n') || '')
  const field = (key, value) => setDraft({ ...draft, [key]: value })
  return (
    <Modal title={project ? 'Edit project' : 'A new place to start.'} subtitle="Keep the details here. Pick up where you left off." close={close}>
      <form
        class="project-editor-form"
        onSubmit={e => {
          e.preventDefault()
          const now = new Date().toISOString()
          save({
            ...draft,
            repositories: repositoryText.split('\n').filter(Boolean),
            tags: tagText
              .split(',')
              .map(t => t.trim().slice(0, 100))
              .filter(Boolean)
              .slice(0, 30),
            name: draft.name.trim(),
            path: draft.path.trim(),
            category: draft.category.trim(),
            id: draft.id || crypto.randomUUID(),
            createdAt: draft.createdAt ?? draft.updatedAt ?? now,
            updatedAt: now
          })
        }}
      >
        <label>
          Project name
          <input required maxLength={120} value={draft.name} onInput={e => field('name', e.target.value)} placeholder="My next good idea" autoFocus />
        </label>
        <label>
          Local path
          <input required maxLength={500} value={draft.path} onInput={e => field('path', e.target.value)} placeholder="~/Dev/Rust/my-project" class="mono" />
          <small>A reference to your folder. Localist does not access your files.</small>
        </label>
        <label>
          Repository URLs
          <textarea rows="2" value={repositoryText} onInput={e => setRepositoryText(e.target.value)} placeholder={'https://github.com/you/project\nhttps://git.example.com/you/project'} class="mono" />
          <small>Optional. One per line. Stored as entered, without URL checks.</small>
        </label>
        <label>
          Description
          <textarea rows="3" maxLength={2000} value={draft.description} onInput={e => field('description', e.target.value)} placeholder="What are you making?" />
        </label>
        <div class="form-row">
          <label>
            Category
            <input required maxLength={60} list="project-categories" value={draft.category} onInput={e => field('category', e.target.value)} placeholder="Choose or create a category" />
            <datalist id="project-categories">
              {categories.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            Status
            <select value={draft.status} onChange={e => field('status', e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Tags
          <input value={tagText} onInput={e => setTagText(e.target.value)} placeholder="CLI, Tools, Side project" />
          <small>Separate tags with commas.</small>
        </label>
        <label class="visibility-setting">
          <Icon name="globe" size={22} />
          <span>
            Make it public<small>Include this project in your showcase. Paths stay private.</small>
          </span>
          <input type="checkbox" checked={draft.public} onChange={e => field('public', e.target.checked)} />
        </label>
        <div class="modal-footer">
          <button type="button" class="button" onClick={close}>
            Cancel
          </button>
          <button class="button primary" type="submit">
            <Icon name="check" />
            {project ? 'Save changes' : 'Add project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ProjectEditor
