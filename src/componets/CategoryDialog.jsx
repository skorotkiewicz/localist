import { useState } from 'preact/hooks'
import Modal from './Modal'

export default function CategoryDialog({ open, projects, categories, persist, onCreated, close }) {
  const [newCategory, setNewCategory] = useState('')
  if (!open) return null

  return (
    <Modal title="A place for something else." subtitle="Add a category for your next kind of project." close={close}>
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
        <div class="modal-footer">
          <button type="button" class="button" onClick={close}>
            Cancel
          </button>
          <button class="button primary">Add category</button>
        </div>
      </form>
    </Modal>
  )
}
