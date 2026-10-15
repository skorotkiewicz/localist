import { windowControls } from '#platform'
import { STATUS_LABELS } from '../projects'
import Icon from './Icon'

export default function WorkspaceHeader({ status, category, setMobileNav }) {
  return (
    <header class="topbar">
      <div class="breadcrumb">
        <button class="icon-button mobile-toggle" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
          <Icon name="list" />
        </button>
        <Icon name="folder" size={16} />
        <span>My workspace</span>
        <span class="slash">/</span>
        <strong>{category !== 'all' ? category : status === 'all' ? 'All projects' : STATUS_LABELS[status]}</strong>
      </div>
      {!windowControls && <span class="app-version">v{__APP_VERSION__}</span>}
    </header>
  )
}
