import { exportJSON } from '../helpers/json'
import Icon from './Icon'
import Modal from './Modal'

export default function StorageDialog({ projects, categories, loaded, notify, importRef, close }) {
  return (
    <Modal title="Local by design." subtitle="No account. No cloud. Your project index is a JSON file on this computer." close={close}>
      <div class="storage-detail">
        <Icon name="storage" size={30} />
        <div>
          <strong>{projects.length} projects, one simple JSON file.</strong>
          <p>Changes are saved automatically to data/projects.json. Export a backup or import an existing index. Import merges projects by ID without removing other projects.</p>
        </div>
      </div>
      <div class="notice">
        <Icon name="lock" size={18} />
        <p>Your data is not stored in the browser. Keep the local server running while editing. JSON backups include private projects and local paths.</p>
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
