import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { validateIndex } from './src/projects.js'

export function createProjectStore(file) {
  function write(index) {
    const validated = validateIndex(index)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 })
    renameSync(`${file}.tmp`, file)
    return validated
  }
  function read() {
    try {
      return validateIndex(JSON.parse(readFileSync(file, 'utf8')))
    } catch (error) {
      if (error.code === 'ENOENT') return write({ projects: [], categories: [] })
      throw error
    }
  }
  return {
    read,
    write(index) {
      read()
      return write(index)
    }
  }
}

export function projectMiddleware(store) {
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/projects') return next()
    const send = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      res.end(JSON.stringify(value))
    }
    const origin = req.headers.origin
    if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`)) {
      return send(403, { error: 'Only same-origin requests can access the local index.' })
    }
    try {
      if (req.method === 'GET') return send(200, store.read())
      if (req.method !== 'PUT') {
        res.setHeader('Allow', 'GET, PUT')
        return send(405, { error: 'Method not allowed.' })
      }
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return send(415, { error: 'Send an application/json index.' })
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 10000000) return send(413, { error: 'The index must be smaller than 10 MB.' })
        chunks.push(chunk)
      }
      let index
      try {
        index = validateIndex(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        return send(400, { error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message })
      }
      return send(200, store.write(index))
    } catch {
      return send(500, {
        error: 'Could not read or save data/projects.json. Check the file format and folder permissions. The existing file has not been replaced.'
      })
    }
  }
}
