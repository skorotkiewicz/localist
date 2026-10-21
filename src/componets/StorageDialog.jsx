import { exportJSON } from '../helpers/json'
import Icon from './Icon'
import Modal from './Modal'

export default function StorageDialog({ projects, categories, loaded, notify, importRef, close }) {
  return (
    <Modal title="Local by design." subtitle="No account. Your full project index is a JSON file on this computer." close={close}>
      <div class="storage-detail">
        <Icon name="storage" size={30} />
        <div>
          <strong>{projects.length} projects, one simple JSON file.</strong>
          <p>Saved changes are written to your local projects.json file. Export a backup or import an existing index. Import merges projects by ID without removing other projects.</p>
        </div>
      </div>
      <div class="notice">
        <Icon name="lock" size={18} />
        <p>Your index is stored on this computer, not in browser storage. JSON backups include private projects and local paths.</p>
      </div>
      <div class="storage-actions">
        <button class="button" onClick={() => importRef.current.click()}>
          <Icon name="upload" size={16} />
          Import JSON
        </button>
        <button class="button primary" onClick={() => exportJSON({ loaded, projects, categories, notify })}>
          <Icon name="download" size={16} />
          Export projects.json
        </button>
      </div>
    </Modal>
  )
}
