import { useState } from 'preact/hooks'
import Modal from './Modal'

export default function CategoryDialog({ open, projects, categories, persist, onCreated, onRemoved, remove, notify, close }) {
  const [newCategory, setNewCategory] = useState('')
  const [removing, setRemoving] = useState('')
  if (!open) return null

  return (
    <Modal
      key={Boolean(removing)}
      title={removing ? 'Remove category?' : 'Manage categories'}
      subtitle={removing ? undefined : 'Add categories or remove ones you no longer use.'}
      close={() => {
        setRemoving('')
        close()
      }}
    >
      {removing ? (
        <>
          <p class="form-note removal-warning">
            Remove <strong>{removing}</strong> from your index? No projects will be changed.
          </p>
          <div class="modal-footer">
            <button type="button" class="button" onClick={() => setRemoving('')} autoFocus>
              Cancel
            </button>
            <button
              type="button"
              class="button danger"
              onClick={async () => {
                if (await remove(removing)) {
                  onRemoved(removing)
                  setRemoving('')
                  notify('Category removed')
                }
              }}
            >
              Remove category
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={async e => {
            e.preventDefault()
            const value = newCategory.trim()
            if (!value) return
            if (await persist(projects, [...new Set([...categories, value])])) {
              onCreated(value)
              setNewCategory('')
              close()
            }
          }}
        >
          <label>
            Category name
            <input required maxLength={60} value={newCategory} onInput={e => setNewCategory(e.target.value)} placeholder="e.g. Go, Design, Weekend ideas" autoFocus />
          </label>
          <p class="form-note">Categories are saved in your local JSON index.</p>
          {categories.length > 0 && (
            <div class="category-management">
              <p class="form-note">Only unused categories can be removed. Archived projects also count as usage.</p>
              <ul class="category-list" aria-label="Existing categories">
                {categories.map(category => (
                  <li key={category}>
                    <span>{category}</span>
                    <button
                      type="button"
                      class="button"
                      aria-label={`Remove category ${category}`}
                      disabled={projects.some(p => p.category === category)}
                      title={projects.some(p => p.category === category) ? 'Used by a project, including archived projects.' : `Remove ${category}`}
                      onClick={() => setRemoving(category)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div class="modal-footer">
            <button type="button" class="button" onClick={close}>
              Cancel
            </button>
            <button class="button primary">Add category</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
