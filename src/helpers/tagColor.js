// Self-contained so standalone live showcases can reuse the same color function.
export function getTagColor(tag) {
  const COLORS = ['#a44742', '#985126', '#805e1b', '#6d641f', '#566b28', '#376f45', '#246f54', '#256e6b', '#2a7183', '#356b8c', '#4768a0', '#975575', '#a3475d']
  let hash = 0
  for (const char of tag.trim().toLowerCase()) {
    hash = (Math.imul(hash, 31) + char.codePointAt(0)) | 0
  }
  return COLORS[(hash >>> 0) % COLORS.length]
}
