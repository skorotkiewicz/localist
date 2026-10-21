import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const windowControls = {
  hide: () => getCurrentWindow().hide(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close()
}

export const publishing = {
  load: () => invoke('load_publishing'),
  save: ({ enabled, autoPublish, serverUrl }) => invoke('save_publishing', { enabled, autoPublish, serverUrl }),
  publish: (automatic = false) => invoke('publish_projects', { automatic })
}

export function loadIndex() {
  return invoke('load_projects')
}

export function saveIndex(index) {
  return invoke('save_projects', { index })
}

export function download(content, name) {
  return invoke('export_file', { content, name })
}
