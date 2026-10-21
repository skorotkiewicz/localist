import { useEffect, useState } from 'preact/hooks'
import { publishing } from '#platform'

export default function PublishingSettings({ notify, copy }) {
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    publishing
      .load()
      .then(value => {
        if (!cancelled) {
          setSettings(value)
          setDraft(value)
        }
      })
      .catch(error => {
        if (!cancelled) setError(error.message || String(error))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const changed = draft && (draft.enabled !== settings.enabled || draft.serverUrl !== settings.serverUrl)

  async function save() {
    setBusy(true)
    setError('')
    try {
      const value = await publishing.save(draft)
      setSettings(value)
      setDraft(value)
      notify(value.enabled ? 'Publishing settings saved. Publish now or save a project to upload.' : 'Publishing disabled. Existing public snapshots remain online.')
    } catch (error) {
      setError(error.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    setError('')
    try {
      const url = await publishing.publish()
      notify(url ? 'Public snapshot published.' : 'Publishing is disabled.')
    } catch (error) {
      setError(`Publishing failed: ${error.message || String(error)}. Your local projects are unchanged. Previous public snapshot may still be online.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class="publishing-settings" aria-labelledby="publishing-heading">
      <h3 id="publishing-heading">Optional live publishing</h3>
      <p class="form-note">Desktop only, off by default. Upload public projects after local saves, without local path fields. Your secret token stays in private app settings, outside JSON backups and exports.</p>
      {!draft && !error && <p role="status">Loading publishing settings…</p>}
      {error && (
        <p class="error-banner" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <fieldset disabled={busy}>
          <label class="visibility-setting">
            <input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
            Publish public projects after local saves
          </label>
          <label>
            Publishing server URL
            <input type="url" value={draft.serverUrl} maxLength={2048} onInput={e => setDraft({ ...draft, serverUrl: e.target.value })} spellCheck={false} />
            <small>Use http://127.0.0.1:8080 for local testing. Other servers require HTTPS.</small>
          </label>
          <div class="publishing-actions">
            <button type="button" class="button" disabled={!changed} onClick={save}>
              {busy ? 'Working…' : 'Save publishing settings'}
            </button>
            <button type="button" class="button" disabled={changed || !settings.enabled} onClick={publish}>
              Publish now
            </button>
          </div>
          {settings.publicUrl && (
            <label>
              Public JSON feed
              <input value={settings.publicUrl} readOnly />
              <small>This URL works after the first successful publication. Disabling publishing does not remove an existing snapshot.</small>
              <button type="button" class="button" onClick={() => copy(settings.publicUrl)}>
                Copy public feed URL
              </button>
            </label>
          )}
        </fieldset>
      )}
    </section>
  )
}
