import { loadIndex, saveIndex, publishing } from '#platform'
import { useEffect, useRef, useState } from 'preact/hooks'
import { STATUS_LABELS, removeUnusedCategory, validateIndex } from '../projects'

export default function useProjectIndex(notify) {
  const [loadError, setLoadError] = useState('')
  const [projects, setProjects] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [extraCategories, setExtraCategories] = useState([])
  const categories = [...new Set([...extraCategories, ...projects.map(p => p.category)])]
  const counts = {
    all: projects.length,
    ...Object.fromEntries(Object.keys(STATUS_LABELS).map(s => [s, projects.filter(p => p.status === s).length]))
  }

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function load() {
      try {
        const index = validateIndex(await loadIndex(controller.signal))
        if (cancelled) return
        setProjects(index.projects)
        setExtraCategories(index.categories)
        setLoaded(true)
      } catch (error) {
        if (!cancelled) setLoadError(error.message || String(error) || 'Could not load projects.json.')
      }
    }
    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  async function persist(next, nextCategories = extraCategories) {
    if (!loaded || loadError) {
      notify('Load the JSON index before making changes.')
      return false
    }
    if (savingRef.current) {
      notify('A save is in progress. Try again in a moment.')
      return false
    }
    savingRef.current = true
    setSaving(true)
    try {
      const data = await saveIndex(validateIndex({ projects: next, categories: nextCategories }))
      const index = validateIndex(data)
      setProjects(index.projects)
      setExtraCategories(index.categories)
      if (publishing) {
        Promise.resolve()
          .then(() => publishing.publish())
          .catch(error => {
            notify(`Saved locally. Publishing failed: ${error.message || String(error)} Previous public snapshot may still be online.`)
          })
      }
      return true
    } catch (error) {
      notify(error.message || String(error) || 'Could not save projects.json.')
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function removeCategory(category) {
    const next = removeUnusedCategory(projects, extraCategories, category)
    if (next === extraCategories) {
      notify('This category is missing or still used by a project.')
      return false
    }
    return persist(projects, next)
  }

  return { projects, categories, counts, loaded, saving, loadError, persist, removeCategory }
}
