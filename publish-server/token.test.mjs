import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { generateToken, isValidToken, publicId } from './token.mjs'

// Shared with main_test.go; never use this predictable token for publishing.
const fixture = 'lp1_AAECAwQFBgcICQoLDA0ODxAREhMUFRYX5VZh-f0u'
const id = '65f46d9a54c22933cb19564aceaa914d7bba4bcb16d4a9360e3ad6063a39446e'

test('token protocol agrees with the Go fixture and native SHA-256', async () => {
  assert.equal(await isValidToken(fixture), true)
  assert.equal(await publicId(fixture), id)
  assert.equal(id, createHash('sha256').update(fixture).digest('hex'))
  const checksum = createHash('sha256')
    .update('localist-publish:token:v1:' + fixture.slice(4, 36))
    .digest()
    .subarray(0, 6)
    .toString('base64url')
  assert.equal(fixture.slice(36), checksum)
})

test('generated tokens validate, differ, and reject altered checksums', async () => {
  const seen = new Set()
  for (let i = 0; i < 10; i++) {
    const token = await generateToken()
    assert.equal(token.length, 44)
    assert.equal(await isValidToken(token), true)
    assert.equal(await publicId(token), createHash('sha256').update(token).digest('hex'))
    assert.equal(seen.has(token), false)
    seen.add(token)
    const altered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    assert.equal(await isValidToken(altered), false)
  }
  for (const invalid of ['', undefined, null, 123, fixture + 'x', fixture.replace('lp1_', 'lp2_')]) {
    assert.equal(await isValidToken(invalid), false)
  }
  await assert.rejects(publicId('invalid'))
})

test('CLI prints a valid token from this ES module repository', async () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./token.mjs', import.meta.url))], { encoding: 'utf8' })
  assert.equal(await isValidToken(output.trim()), true)
})
