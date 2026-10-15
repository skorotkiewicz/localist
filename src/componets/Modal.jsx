import { useEffect, useRef } from 'preact/hooks'
import Icon from './Icon'

function Modal({ title, subtitle, close, children, wide }) {
  const ref = useRef()
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    const onCancel = e => {
      e.preventDefault()
      close()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => dialog.removeEventListener('cancel', onCancel)
  }, [])
  return (
    <dialog
      ref={ref}
      class={`modal ${wide ? 'wide' : ''}`}
      onClick={e => {
        if (e.target === ref.current) close()
      }}
    >
      <div class="modal-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button class="icon-button" aria-label="Close dialog" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  )
}

export default Modal
