import { STATUS_LABELS } from '../projects'
import Icon from './Icon'

export default function WorkspaceHeader({ status, category, setMobileNav, setModal }) {
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
      <div class="topbar-right">
        <span class="local-badge">
          <span />
          Local-first. Always.
        </span>
        <button class="icon-button help-button" aria-label="About the local JSON file" onClick={() => setModal('storage')}>
          <Icon name="help" size={19} />
        </button>
        <span class="profile-avatar" title="Personal workspace">
          M
        </span>
      </div>
    </header>
  )
}
