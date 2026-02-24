import React, { useState } from 'react'
import Button from '../ui/Button'
import { useDatabase } from '../../contexts/DatabaseContext'

export default function NotesPanel({ recipeId, initialNotes }: { recipeId: string; initialNotes: string }) {
  const { updateRecipe } = useDatabase()
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateRecipe(recipeId, { notes })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="gc-panel">
      <h3>Notes</h3>
      <textarea className="gc-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={10} />
      <div className="gc-row">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Notes'}</Button>
      </div>
    </div>
  )
}
