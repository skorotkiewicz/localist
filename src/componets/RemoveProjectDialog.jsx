import Modal from './Modal'

export default function RemoveProjectDialog({ project, close, remove }) {
  return (
    <Modal title="Remove project?" close={close}>
      <p class="form-note removal-warning">
        Remove <strong>{project.name}</strong> from your index? This cannot be undone. Local files and repositories will not be deleted.
      </p>
      <div class="modal-footer">
        <button type="button" class="button" onClick={close} autoFocus>
          Cancel
        </button>
        <button type="button" class="button danger" onClick={remove}>
          Remove project
        </button>
      </div>
    </Modal>
  )
}
