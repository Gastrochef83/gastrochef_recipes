// src/pages/SalesMachine.tsx
import { useMemo, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { getLicenseLabel } from '../lib/license'

function buildPrintShareUrl(recipeId: string) {
  const base = window.location.origin
  return `${base}/#/print?id=${encodeURIComponent(recipeId)}`
}

export default function SalesMachine() {
  const [sp] = useSearchParams()
  const recipeId = sp.get('id') || ''
  const [copied, setCopied] = useState<string>('')

  const shareUrl = useMemo(() => {
    if (!recipeId) return ''
    return buildPrintShareUrl(recipeId)
  }, [recipeId])

  const license = useMemo(() => getLicenseLabel(), [])

  const copy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied('Copied!')
      window.setTimeout(() => setCopied(''), 1400)
    } catch {
      setCopied('Copy failed')
      window.setTimeout(() => setCopied(''), 1400)
    }
  }

  return (
    <div className="gc-page">
      <div className="gc-page-head">
        <div>
          <div className="gc-title">Sales Machine</div>
          <div className="gc-hint" style={{ marginTop: 6 }}>
            Make GastroChef instantly demoable, shareable, and upgrade-ready. <span className="gc-pill">{license}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <NavLink to="/settings">
            <Button variant="secondary">License & Demo</Button>
          </NavLink>
          <NavLink to="/recipes">
            <Button variant="primary">Open Recipes</Button>
          </NavLink>
        </div>
      </div>

      <div className="gc-grid-2">
        <div className="gc-card-soft gc-sales-card">
          <div className="gc-label">Share a Recipe Card</div>
          <div className="gc-hint" style={{ marginTop: 8 }}>
            Paste a Recipe ID in the URL like <span className="gc-code">#/sales?id=RECIPE_ID</span> to generate a share link.
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="gc-field">
              <div className="gc-label">Recipe ID</div>
              <input
                className="gc-input"
                value={recipeId}
                readOnly
                placeholder="Open any recipe editor and copy its id"
              />
              <div className="gc-hint" style={{ marginTop: 6 }}>
                Tip: Open Recipe Editor → use the Print Preview button (we will share that same print URL).
              </div>
            </div>

            <div className="gc-field" style={{ marginTop: 12 }}>
              <div className="gc-label">Share URL</div>
              <input className="gc-input" value={shareUrl} readOnly placeholder="Share URL appears here…" />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              <Button variant="primary" onClick={copy} disabled={!shareUrl}>
                Copy Share Link
              </Button>
              {shareUrl && (
                <a className="gc-btn gc-btn-ghost" href={shareUrl} target="_blank" rel="noreferrer">
                  Open Print Card
                </a>
              )}
              <span className="gc-hint">{copied}</span>
            </div>
          </div>
        </div>

        <div className="gc-card-soft gc-sales-card">
          <div className="gc-label">Upgrade-Ready (UI)</div>
          <div className="gc-hint" style={{ marginTop: 8 }}>
            This pack adds a visible plan badge + demo banner. You can connect payments later without touching core logic.
          </div>

          <ul className="gc-sales-list">
            <li>
              <span className="gc-sales-dot" />
              Plan badge in the app header (Free / Pro / Team).
            </li>
            <li>
              <span className="gc-sales-dot" />
              Demo Mode banner for showcasing.
            </li>
            <li>
              <span className="gc-sales-dot" />
              Share link (print card) for investors/clients.
            </li>
          </ul>

          <div className="gc-sales-cta">
            <NavLink to="/settings">
              <Button variant="secondary">Open Settings</Button>
            </NavLink>
            <NavLink to="/dashboard">
              <Button variant="ghost">Back to Dashboard</Button>
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  )
}
