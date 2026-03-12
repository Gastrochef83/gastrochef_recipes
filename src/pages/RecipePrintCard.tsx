import { ReactNode } from 'react'

/*
GastroChef Signature Executive Card
----------------------------------
Design goal:
Professional executive recipe sheet used by modern kitchens.
Style aligned with GastroChef system:
Olive • Teal • Warm White • Charcoal

This layout focuses on:
• readability in kitchens
• premium executive presentation
• compatibility with long recipes
*/

export default function RecipePrintCard() {
  const recipe = {
    name: 'Signature Chicken Shawarma',
    code: 'GC‑RC‑204',
    category: 'Main Dish',
    portions: 8,
    yield: '1.2 kg',
    description:
      'Classic Middle Eastern chicken shawarma with balanced spice marinade, slow roasted and sliced thin.',
  }

  const ingredients = [
    { code: 'CHK001', name: 'Chicken Breast', qty: '1 kg', cost: '$6.20' },
    { code: 'SPC021', name: 'Shawarma Spice', qty: '0.1 kg', cost: '$1.40' },
    { code: 'LEM002', name: 'Fresh Lemon', qty: '0.1 kg', cost: '$0.90' },
    { code: 'SAL001', name: 'Salt', qty: '0.01 kg', cost: '$0.10' },
  ]

  const steps = [
    'Trim chicken breast and slice evenly.',
    'Mix marinade ingredients and coat chicken thoroughly.',
    'Marinate for minimum 4 hours under refrigeration.',
    'Roast or grill until internal temperature reaches safe level.',
    'Rest briefly then slice thin for service.'
  ]

  return (
    <div className="min-h-screen bg-[#f7f7f4] p-10 font-sans text-[#2b2b2b]">
      <div className="mx-auto max-w-5xl rounded-3xl border border-[#dfe5df] bg-white shadow-xl">

        {/* Header */}

        <header className="border-b border-[#dfe5df] px-10 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs tracking-[0.3em] text-[#556b2f] uppercase font-semibold">
                GastroChef Signature
              </div>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                {recipe.name}
              </h1>
              <p className="mt-3 max-w-xl text-sm text-[#5a5a5a]">
                {recipe.description}
              </p>
            </div>

            <div className="text-right text-sm">
              <div className="font-medium">Code</div>
              <div className="text-[#2f6f5e] font-semibold">{recipe.code}</div>

              <div className="mt-3 font-medium">Category</div>
              <div>{recipe.category}</div>

              <div className="mt-3 font-medium">Yield</div>
              <div>{recipe.yield}</div>

              <div className="mt-3 font-medium">Portions</div>
              <div>{recipe.portions}</div>
            </div>
          </div>
        </header>

        {/* Ingredients Table */}

        <section className="px-10 py-8">
          <h2 className="mb-6 text-xl font-semibold text-[#556b2f]">
            Ingredient Costing
          </h2>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#dfe5df] text-left text-[#556b2f]">
                <th className="pb-3">Code</th>
                <th className="pb-3">Ingredient</th>
                <th className="pb-3">Quantity</th>
                <th className="pb-3 text-right">Cost</th>
              </tr>
            </thead>

            <tbody>
              {ingredients.map((i) => (
                <tr key={i.code} className="border-b border-[#eef1ee]">
                  <td className="py-3 text-[#2f6f5e] font-medium">{i.code}</td>
                  <td className="py-3">{i.name}</td>
                  <td className="py-3">{i.qty}</td>
                  <td className="py-3 text-right font-medium">{i.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Method */}

        <section className="border-t border-[#dfe5df] px-10 py-8">
          <h2 className="mb-6 text-xl font-semibold text-[#556b2f]">
            Preparation Method
          </h2>

          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2f6f5e] text-white text-sm font-semibold">
                  {i + 1}
                </div>
                <p className="text-sm leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}

        <footer className="border-t border-[#dfe5df] bg-[#f7f7f4] px-10 py-5 text-xs text-[#666] flex justify-between">
          <div>GastroChef Executive Recipe System</div>
          <div>Signature Kitchen Edition</div>
        </footer>
      </div>
    </div>
  )
}
