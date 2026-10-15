export const windowControls = null

async function request(options) {
  const response = await fetch('/api/projects', options)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not read or save the project index.')
  return data
}

export function loadIndex(signal) {
  return request({ signal })
}

export function saveIndex(index) {
  return request({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(index)
  })
}

export function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
