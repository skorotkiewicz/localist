import { paths } from '../helpers/svg'

function Icon({ name, size = 18, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name] || paths.folder} />
    </svg>
  )
}

export default Icon
