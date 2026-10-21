import { useState } from 'preact/hooks'
import { publishing } from '#platform'
import PublishingSettings from './PublishingSettings'
import { generateShowcase } from '../projects'
import { download } from '../helpers/json'
import Icon from './Icon'
import Modal from './Modal'

export default function ShowcaseDialog({ open, projects, notify, copy, close }) {
  const [showcaseTitle, setShowcaseTitle] = useState('Things I’m building')
  if (!open) return null
  const publicCount = projects.filter(p => p.public).length
  const html = generateShowcase(projects, showcaseTitle)

  return (
    <Modal title="A little corner of the internet." subtitle={`${publicCount} public projects. No private projects or local paths, ever.`} close={close} wide>
      {publishing && <PublishingSettings notify={notify} copy={copy} />}
      <label>
        Showcase title
        <input value={showcaseTitle} onInput={e => setShowcaseTitle(e.target.value)} maxLength={150} />
      </label>
      <div class="preview-label">
        <span>LIVE PREVIEW</span>
        <span>
          <Icon name="globe" size={13} />
          Public projects only
        </span>
      </div>
      <iframe class="showcase-preview" title="Public project showcase preview" srcDoc={html} sandbox="" />
      <div class="notice">
        <Icon name="code" size={19} />
        <p>Download the HTML and host it on your website. Then copy the embed code. Re-export when your projects change.</p>
      </div>
      <div class="embed-code">
        <code>{'<iframe src="/showcase.html" title="My projects" width="100%" height="600" style="border:0" loading="lazy"></iframe>'}</code>
        <button class="icon-button" aria-label="Copy embed code" onClick={() => copy('<iframe src="/showcase.html" title="My projects" width="100%" height="600" style="border:0" loading="lazy"></iframe>')}>
          <Icon name="copy" size={17} />
        </button>
      </div>
      <div class="modal-footer">
        <span class="public-count">
          <Icon name="globe" size={14} />
          {publicCount} public projects
        </span>
        <button
          class="button primary"
          onClick={async () => {
            try {
              const path = await download(html, 'showcase.html', 'text/html')
              notify(path ? `Public showcase exported to ${path}` : 'Public showcase download started')
            } catch (error) {
              notify(`Export failed: ${error.message || String(error)}`)
            }
          }}
        >
          <Icon name="download" size={16} />
          Download showcase
        </button>
      </div>
    </Modal>
  )
}
