import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const windowControls = {
  hide: () => getCurrentWindow().hide(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close()
}

export const publishing = {
  load: () => invoke('load_publishing'),
  save: ({ enabled, serverUrl }) => invoke('save_publishing', { enabled, serverUrl }),
  publish: () => invoke('publish_projects')
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
