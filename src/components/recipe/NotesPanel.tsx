import React, { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { useDatabase } from '../../contexts/DatabaseContext'

export default function NotesPanel({
  recipeId,
  initialNotes
}: {
  recipeId: string
  initialNotes?: string | null
}) {
  const { updateRecipe } = useDatabase()
  const [notes, setNotes] = useState(initialNotes || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNotes(initialNotes || '')
  }, [initialNotes])

  const save = async () => {
    setSaving(true)
    try {
      await updateRecipe(recipeId, { notes })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="np__ta"
        placeholder="Write notes for the kitchen…"
        rows={10}
      />
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Notes'}</Button>
      </div>

      <style>{`
        .np__ta{
          width: 100%;
          border: 1px solid var(--border);
          background: var(--surface-secondary);
          color: var(--text-primary);
          border-radius: 14px;
          padding: 14px;
          font-size: 1rem;
          line-height: 1.5;
          outline: none;
          box-shadow: var(--shadow-sm);
          resize: vertical;
        }
        .np__ta:focus{ border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 20%, transparent); }
      `}</style>
    </div>
  )
}
