import tagIcons from './projectIcons.json' with { type: 'json' }

export function getProjectIcon({ tags }) {
  const normalized = tags.map(tag => tag.trim().toLowerCase())
  return tagIcons.find(([required]) => required.every(tag => normalized.includes(tag)))?.[1] ?? 'folder'
}
