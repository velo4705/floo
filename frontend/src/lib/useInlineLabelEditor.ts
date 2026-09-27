import { useEffect, useRef, useState } from 'react'

interface InlineLabelEditorOptions {
  id: string
  label: string
  editing: boolean
  commitLabel: (id: string, label: string) => void
  cancelEdit: () => void
}

export function useInlineLabelEditor({
  id,
  label,
  editing,
  commitLabel,
  cancelEdit,
}: InlineLabelEditorOptions) {
  const [draft, setDraft] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    setDraft(label)
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing, label, id])

  return {
    draft,
    setDraft,
    inputRef,
    commit: () => {
      const next = draft.trim()
      if (next && next !== label) commitLabel(id, next)
      else cancelEdit()
    },
    cancel: cancelEdit,
  }
}
