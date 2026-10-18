import { createPortal } from 'preact/compat'
import { useLayoutEffect, useState } from 'preact/hooks'
import Icon from './Icon'

export default function WindowTitlebar({ controls, notify }) {
  const [container, setContainer] = useState(document.body)

  useLayoutEffect(() => {
    const update = () => setContainer(document.querySelector('dialog[open]') || document.body)
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    update()
    return () => observer.disconnect()
  }, [])

  return createPortal(
    <div class="window-titlebar">
      <div class="window-drag-region" data-tauri-drag-region>
        <Icon name="folder" size={16} />
        <span>Localist</span>
        <span class="app-version">v{__APP_VERSION__}</span>
      </div>
      <div class="window-controls" role="group" aria-label="Window controls">
        {[
          ['hide', 'minimize', 'Hide to tray'],
          ['toggleMaximize', 'maximize', 'Maximize or restore window'],
          ['close', 'close', 'Close window']
        ].map(([action, icon, label]) => (
          <button
            key={action}
            type="button"
            aria-label={label}
            title={label}
            onClick={async () => {
              try {
                await controls[action]()
              } catch (error) {
                notify(`Could not ${label.toLowerCase()}: ${error?.message || String(error)}`)
              }
            }}
          >
            <Icon name={icon} size={16} />
          </button>
        ))}
      </div>
    </div>,
    container
  )
}
