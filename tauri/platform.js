import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const windowControls = {
  hide: () => getCurrentWindow().hide(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close()
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
