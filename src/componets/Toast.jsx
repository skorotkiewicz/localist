import { createPortal } from 'preact/compat'
import { useLayoutEffect, useState } from 'preact/hooks'
import Icon from './Icon'

export default function Toast({ message, dismiss }) {
  const [container, setContainer] = useState(document.body)

  useLayoutEffect(() => {
    const update = () => setContainer(document.querySelector('dialog[open]') || document.body)
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    update()
    return () => observer.disconnect()
  }, [])

  return createPortal(
    <div class="toast" role="status">
      <span>
        <Icon name="check" size={16} />
      </span>
      <div class="toast-message">{message}</div>
      <button class="icon-button" aria-label="Dismiss notification" onClick={dismiss}>
        <Icon name="close" size={15} />
      </button>
    </div>,
    container
  )
}
