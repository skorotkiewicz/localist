import { useEffect, useState } from 'preact/hooks'
import { publishing } from '#platform'

export default function PublishingSettings({ notify, onChange }) {
  const [settings, setSettings] = useState(null)
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
        setBusy(value.enabled)
        try {
          if (value.enabled) await publishing.publish()
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

  async function toggle(enabled) {
    setBusy(true)
    setError('')
    setSettings({ ...settings, enabled })
    onChange(null)
    let next = settings
    try {
      next = await publishing.save({ enabled, serverUrl: settings.serverUrl })
      if (enabled) {
        await publishing.publish()
        notify('Publishing enabled. New showcase exports load server data when opened.')
      }
    } catch (error) {
      setError(`Publishing failed: ${error.message || String(error)} Your local projects are unchanged.`)
    } finally {
      setSettings(next)
      onChange(next)
      setBusy(false)
    }
  }

  return (
    <section class="publishing-settings">
      <label class="visibility-setting">
        <input type="checkbox" checked={settings?.enabled || false} disabled={!settings || busy} onChange={e => toggle(e.target.checked)} />
        Publish public projects after local saves
      </label>
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
    </section>
  )
}
