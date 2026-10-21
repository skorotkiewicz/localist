const PREFIX = 'lp1_'
const CONTEXT = 'localist-publish:token:v1:'
const FORMAT = /^lp1_[A-Za-z0-9_-]{40}$/
const encoder = new TextEncoder()

const base64url = bytes =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
const checksum = async random => base64url((await digest(CONTEXT + random)).slice(0, 6))

// Generate once per publisher, then retain the secret for subsequent updates.
export async function generateToken() {
  const random = base64url(crypto.getRandomValues(new Uint8Array(24)))
  return PREFIX + random + (await checksum(random))
}

export async function isValidToken(token) {
  if (typeof token !== 'string' || !FORMAT.test(token)) return false
  return token.slice(36) === (await checksum(token.slice(4, 36)))
}

export async function publicId(token) {
  if (!(await isValidToken(token))) throw new Error('Invalid publishing token')
  return Array.from(await digest(token), byte => byte.toString(16).padStart(2, '0')).join('')
}

if (import.meta.main) console.log(await generateToken())
