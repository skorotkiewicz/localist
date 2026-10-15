import { invoke } from '@tauri-apps/api/core'

export function loadIndex() {
  return invoke('load_projects')
}

export function saveIndex(index) {
  return invoke('save_projects', { index })
}

export function download(content, name) {
  return invoke('export_file', { content, name })
}
