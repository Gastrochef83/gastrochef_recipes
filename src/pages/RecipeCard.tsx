import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { supabase } from "../lib/supabase"

export default function RecipePrintCard() {
  const [params] = useSearchParams()
  const id = params.get("id")

  const [recipe, setRecipe] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    const load = async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(`
          id,
          code,
          code_category,
          kitchen_id,
          name,
          category,
          portions,
          description,
          method,
          method_legacy,
          method_steps,
          method_step_photos,
          created_at,
          yield_qty,
          yield_unit,
          currency,
          photo_url,
          calories,
          protein_g,
          carbs_g,
          fat_g,
          selling_price,
          target_food_cost_pct
        `)
        .eq("id", id)
        .single()

      if (!error) setRecipe(data)
      setLoading(false)
    }

    load()
  }, [id])

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>
  if (!recipe) return <div style={{ padding: 40 }}>Recipe not found</div>

  const fmtQty = (n: number) => {
    if (!Number.isFinite(n)) return ""
    if (Math.round(n) === n) return String(n)
    return n.toFixed(2)
  }

  const methodLegacy = String(
    recipe?.method_legacy ??
    recipe?.method ??
    ""
  ).trim()

  const steps: string[] = (() => {
    const arr = Array.isArray(recipe?.method_steps)
      ? recipe.method_steps
      : null

    if (arr && arr.length) {
      return arr
        .map((s: any) => String(s ?? "").trim())
        .filter(Boolean)
    }

    return methodLegacy
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  })()

  const stepPhotos = Array.isArray(recipe?.method_step_photos)
    ? recipe.method_step_photos
    : []

  const yieldLabel = (() => {
    const qRaw = recipe?.yield_qty
    const uRaw = recipe?.yield_unit

    const q = Number(qRaw)
    const u = String(uRaw ?? "").trim()

    if (Number.isFinite(q) && qRaw != null) {
      const v = fmtQty(q)
      return u ? `${v} ${u}` : `${v}`
    }

    const pRaw = recipe?.yield_percent ?? recipe?.yield_pct
    const p = Number(pRaw)

    if (Number.isFinite(p) && pRaw != null) {
      return `${Math.round(p * 1000) / 1000}%`
    }

    return "—"
  })()

  return (
    <div style={{ padding: 40, fontFamily: "Arial", maxWidth: 900, margin: "auto" }}>
      <h1>{recipe.name}</h1>

      {recipe.photo_url && (
        <img
          src={recipe.photo_url}
          alt={recipe.name}
          style={{ width: 320, marginBottom: 20 }}
        />
      )}

      <p><strong>Category:</strong> {recipe.category || "—"}</p>
      <p><strong>Portions:</strong> {recipe.portions || "—"}</p>
      <p><strong>Yield:</strong> {yieldLabel}</p>

      {recipe.description && (
        <>
          <h2>Description</h2>
          <p>{recipe.description}</p>
        </>
      )}

      {(steps.length || methodLegacy) && (
        <>
          <h2>Method</h2>

          {steps.length ? (
            <div>
              {steps.map((s, i) => {
                const img = stepPhotos?.[i]

                return (
                  <div key={i} style={{ marginBottom: 20 }}>
                    {img && (
                      <img
                        src={img}
                        alt={`Step ${i + 1}`}
                        style={{ width: 250 }}
                      />
                    )}

                    <p><strong>Step {i + 1}</strong></p>
                    <p>{s}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p>{methodLegacy}</p>
          )}
        </>
      )}

      <button
        onClick={() => window.print()}
        style={{
          marginTop: 30,
          padding: "10px 20px",
          fontSize: 16,
          cursor: "pointer"
        }}
      >
        Print
      </button>
    </div>
  )
}
