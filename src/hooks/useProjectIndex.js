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

    async function load() {
      try {
        const response = await fetch('/api/projects', { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not load the project index.')
        const index = validateIndex(data)
        setProjects(index.projects)
        setExtraCategories(index.categories)
        setLoaded(true)
      } catch (error) {
        if (error.name !== 'AbortError') setLoadError(error.message || 'Could not load data/projects.json. Is the local server running?')
      }
    }
    load()
    return () => controller.abort()
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
      const response = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: next, categories: nextCategories })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save the index.')
      const index = validateIndex(data)
      setProjects(index.projects)
      setExtraCategories(index.categories)
      return true
    } catch (error) {
      notify(error.message || 'Save failed. Check that the local server is running.')
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
