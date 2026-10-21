import { useEffect, useState } from 'preact/hooks'
import { publishing } from '#platform'

export default function PublishingSettings({ notify, copy, onChange }) {
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    onChange(null)
    publishing
      .load()
      .then(async value => {
        if (cancelled) return
        setSettings(value)
        setDraft(value)
        setBusy(value.enabled && value.autoPublish)
        try {
          if (value.enabled && value.autoPublish) await publishing.publish(true)
        } catch (error) {
          if (!cancelled) setError(`Publishing failed: ${error.message || String(error)} Your local projects are unchanged.`)
        } finally {
          if (!cancelled) {
            onChange(value)
            setBusy(false)
          }
        }
      })
      .catch(error => {
        if (!cancelled) setError(error.message || String(error))
      })
    return () => {
      cancelled = true
    }
  }, [onChange])

  const changed = draft && (draft.enabled !== settings.enabled || draft.autoPublish !== settings.autoPublish || draft.serverUrl !== settings.serverUrl)

  async function save() {
    setBusy(true)
    setError('')
    onChange(null)
    let next = settings
    try {
      next = await publishing.save(draft)
      setDraft(next)
      if (next.enabled && next.autoPublish) await publishing.publish(true)
      notify('Publishing settings saved.')
    } catch (error) {
      setError(`Publishing failed: ${error.message || String(error)} Your local projects are unchanged.`)
    } finally {
      setSettings(next)
      onChange(next)
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    setError('')
    try {
      await publishing.publish()
      notify('Public snapshot published.')
    } catch (error) {
      setError(`Publishing failed: ${error.message || String(error)} Your local projects are unchanged.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details class="publishing-settings" aria-labelledby="publishing-heading">
      <summary id="publishing-heading">Publishing settings</summary>
      <p class="form-note">Desktop only, off by default. Publish public projects automatically or on demand, without local path fields. Your secret token stays in private app settings, outside JSON backups and exports.</p>
      {draft && (
        <fieldset disabled={busy}>
          <label class="visibility-setting">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={e => {
                setDraft({ ...draft, enabled: e.target.checked })
                setError('')
              }}
            />
            Enable publishing
          </label>
          <label class="visibility-setting">
            <input
              type="checkbox"
              checked={draft.autoPublish}
              disabled={!draft.enabled}
              onChange={e => {
                setDraft({ ...draft, autoPublish: e.target.checked })
                setError('')
              }}
            />
            Auto-publish after local saves
          </label>
          {settings.enabled && !settings.autoPublish && <p class="form-note">Manual mode: local changes, including privacy changes, stay local until you click Publish now.</p>}
          <label>
            Publishing server URL
            <input
              type="url"
              value={draft.serverUrl}
              maxLength={2048}
              onInput={e => {
                setDraft({ ...draft, serverUrl: e.target.value })
                setError('')
              }}
              spellCheck={false}
            />
            {/* <small>Use http://127.0.0.1:8080 for local testing. Other servers require HTTPS.</small>*/}
          </label>
          <div class="publishing-actions">
            <button type="button" class="button" disabled={!changed} onClick={save}>
              Save publishing settings
            </button>
            <button type="button" class="button" disabled={changed || !settings.enabled} onClick={publish}>
              Publish now
            </button>
          </div>
          {settings.publicUrl && (
            <label>
              Public JSON feed
              <input value={settings.publicUrl} readOnly />
              <small>This URL becomes readable after the first successful publication.</small>
              <button type="button" class="button" onClick={() => copy(settings.publicUrl)}>
                Copy public feed URL
              </button>
            </label>
          )}
        </fieldset>
      )}
      {busy && (
        <p class="form-note" role="status">
          Connecting publishing…
        </p>
      )}
      {error && (
        <p class="error-banner" role="alert">
          {error}
        </p>
      )}
    </details>
  )
}
