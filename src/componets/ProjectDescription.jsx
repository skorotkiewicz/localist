import { useLayoutEffect, useRef } from 'preact/hooks'

// import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks'
//
// export default function ProjectDescription({ description, name }) {
//   const [expanded, setExpanded] = useState(false)
//   const [truncated, setTruncated] = useState(false)
//   const textRef = useRef()
//   const buttonRef = useRef()
//   const id = useId()
//
//   useLayoutEffect(() => {
//     if (expanded) return
//     const text = textRef.current
//     const measure = () => {
//       const button = buttonRef.current
//       // Measure without the button so it disappears as soon as the full text fits.
//       if (button) button.style.display = 'none'
//       const clipped = text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1
//       if (button) button.style.display = ''
//       setTruncated(clipped)
//     }
//     const observer = new ResizeObserver(measure)
//     observer.observe(text)
//     measure()
//     return () => observer.disconnect()
//   }, [description, expanded])
//
//   return (
//     <div class="project-description" data-expanded={expanded}>
//       <p ref={textRef} id={id} title={description} class="description-preview">
//         {description}
//       </p>
//       {(expanded || truncated) && (
//         <button ref={buttonRef} type="button" class="description-toggle" aria-expanded={expanded} aria-controls={id} aria-label={expanded ? `Show less for ${name}` : `Read more about ${name}`} onClick={() => setExpanded(!expanded)}>
//           {expanded ? 'Show less' : 'Read more'}
//         </button>
//       )}
//     </div>
//   )
// }

export function fitDescription(element) {
  if (element.open) return
  const lineHeight = Number.parseFloat(getComputedStyle(element.firstElementChild).lineHeight)
  // clientHeight rounds fractional CSS pixels, so allow half a pixel at the line boundary.
  const lines = Math.max(1, Math.floor((element.clientHeight + 0.5) / lineHeight))
  element.style.setProperty('--description-lines', String(lines))
}

export default function ProjectDescription({ description }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const element = ref.current
    const observer = new ResizeObserver(() => fitDescription(element))
    observer.observe(element)
    fitDescription(element)
    return () => observer.disconnect()
  }, [description])
  return (
    <details ref={ref} class="project-description">
      <summary class="description-preview" title={description}>
        {description}
      </summary>
    </details>
  )
}
