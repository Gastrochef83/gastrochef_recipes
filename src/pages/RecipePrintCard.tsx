import { ReactNode } from 'react'

/*
GastroChef Global SaaS Recipe Card
---------------------------------
Enterprise level recipe card for SaaS kitchen systems.
Supports:
• Dish hero image
• Ingredient costing
• Step-by-step method
• Step images
• Executive layout for restaurant operations

Color System (GastroChef Identity)
Olive  : #556b2f
Teal   : #2f6f5e
Cream  : #f7f6f2
Charcoal : #2b2b2b
*/

export default function RecipePrintCard() {

  const recipe = {
    name: 'Signature Chicken Shawarma',
    code: 'GC‑204',
    category: 'Main Dish',
    portions: 8,
    yield: '1.2 kg',
    cost: '$8.60',
    selling: '$18.00',
    description:
      'Classic Middle Eastern shawarma marinated with balanced spices and slow roasted for tender slices.',

    heroImage:
      'https://images.unsplash.com/photo-1604908177522-429bd6f98d0d?q=80&w=1400&auto=format&fit=crop'
  }

  const ingredients = [
    { code: 'CHK001', name: 'Chicken Breast', qty: '1 kg', cost: '$6.20' },
    { code: 'SPC021', name: 'Shawarma Spice', qty: '0.1 kg', cost: '$1.40' },
    { code: 'LEM002', name: 'Fresh Lemon', qty: '0.1 kg', cost: '$0.90' },
    { code: 'SAL001', name: 'Salt', qty: '0.01 kg', cost: '$0.10' }
  ]

  const steps = [
    {
      text: 'Trim chicken breast and slice evenly.',
      img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=1200&auto=format&fit=crop'
    },

    {
      text: 'Prepare shawarma marinade and coat chicken.',
      img: 'https://images.unsplash.com/photo-1625944525533-473f1c3d54e7?q=80&w=1200&auto=format&fit=crop'
    },

    {
      text: 'Marinate minimum 4 hours under refrigeration.',
      img: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?q=80&w=1200&auto=format&fit=crop'
    },

    {
      text: 'Roast or grill chicken until fully cooked.',
      img: 'https://images.unsplash.com/photo-1604908554007-4e5d2c3af1c3?q=80&w=1200&auto=format&fit=crop'
    },

    {
      text: 'Rest briefly then slice thin for service.',
      img: 'https://images.unsplash.com/photo-1617196038435-2a7c8b0a7f55?q=80&w=1200&auto=format&fit=crop'
    }
  ]


  return (

    <div className="min-h-screen bg-[#f7f6f2] p-10 text-[#2b2b2b]">

      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-[#dfe5df] bg-white shadow-2xl">

        {/* HERO SECTION */}

        <header className="grid md:grid-cols-2">

          <div className="p-10">

            <div className="text-xs uppercase tracking-[0.35em] text-[#556b2f] font-semibold">
              GastroChef Global Recipe System
            </div>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              {recipe.name}
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-[#5f5f5f]">
              {recipe.description}
            </p>


            <div className="mt-6 grid grid-cols-2 gap-6 text-sm">

              <Info label="Recipe Code" value={recipe.code} />

              <Info label="Category" value={recipe.category} />

              <Info label="Yield" value={recipe.yield} />

              <Info label="Portions" value={String(recipe.portions)} />

            </div>


            <div className="mt-8 flex gap-6 text-sm">

              <Metric label="Recipe Cost" value={recipe.cost} />

              <Metric label="Selling Price" value={recipe.selling} />

            </div>

          </div>


          <div className="h-[320px] md:h-full">

            <img
              src={recipe.heroImage}
              alt="Dish"
              className="h-full w-full object-cover"
            />

          </div>

        </header>



        {/* INGREDIENT COSTING */}

        <section className="px-10 py-10">

          <SectionTitle>
            Ingredient Costing
          </SectionTitle>


          <table className="w-full border-collapse text-sm">

            <thead>

              <tr className="border-b border-[#e5ebe6] text-left text-[#556b2f]">

                <th className="pb-3">Code</th>

                <th className="pb-3">Ingredient</th>

                <th className="pb-3">Quantity</th>

                <th className="pb-3 text-right">Cost</th>

              </tr>

            </thead>


            <tbody>

              {ingredients.map((i) => (

                <tr key={i.code} className="border-b border-[#eef2ee]">

                  <td className="py-3 font-medium text-[#2f6f5e]">{i.code}</td>

                  <td className="py-3">{i.name}</td>

                  <td className="py-3">{i.qty}</td>

                  <td className="py-3 text-right font-semibold">{i.cost}</td>

                </tr>

              ))}

            </tbody>

          </table>

        </section>



        {/* METHOD WITH STEP IMAGES */}

        <section className="border-t border-[#e5ebe6] px-10 py-10">

          <SectionTitle>
            Preparation Method
          </SectionTitle>


          <div className="grid gap-10">

            {steps.map((step, i) => (

              <div key={i} className="grid md:grid-cols-[120px_1fr] gap-6 items-start">

                <div className="flex items-center justify-center rounded-full bg-[#2f6f5e] text-white h-12 w-12 text-sm font-semibold">
                  {i + 1}
                </div>


                <div>

                  <img
                    src={step.img}
                    alt="step"
                    className="mb-4 w-full max-h-[260px] object-cover rounded-xl"
                  />


                  <p className="text-sm leading-relaxed">
                    {step.text}
                  </p>

                </div>

              </div>

            ))}

          </div>

        </section>



        {/* FOOTER */}

        <footer className="flex justify-between border-t border-[#e5ebe6] bg-[#f7f6f2] px-10 py-5 text-xs text-[#6b6b6b]">

          <div>
            GastroChef Global Kitchen System
          </div>

          <div>
            SaaS Recipe Engine
          </div>

        </footer>


      </div>


    </div>

  )

}


function SectionTitle({ children }: { children: ReactNode }) {

  return (

    <h2 className="mb-6 text-xl font-semibold text-[#556b2f]">
      {children}
    </h2>

  )

}


function Info({ label, value }: { label: string; value: string }) {

  return (

    <div>

      <div className="text-xs uppercase tracking-[0.2em] text-[#8a8a8a]">
        {label}
      </div>

      <div className="mt-1 font-medium">
        {value}
      </div>

    </div>

  )

}


function Metric({ label, value }: { label: string; value: string }) {

  return (

    <div className="rounded-xl border border-[#dfe5df] px-4 py-3">

      <div className="text-xs uppercase tracking-[0.2em] text-[#8a8a8a]">
        {label}
      </div>

      <div className="mt-1 font-semibold text-[#2f6f5e]">
        {value}
      </div>

    </div>

  )

}
