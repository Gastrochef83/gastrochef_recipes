// src/pages/Recipes.tsx
// ✅ LOGIC 100% SAME
// ✅ Overlay + Badges removed from hero image (UI only)

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'

const KITCHEN_ID = '9ca989dc-3115-4cf6-ba0f-af1f25374721'

type RecipeRow = {
  id:string
  kitchen_id:string
  name:string
  category:string|null
  portions:number
  yield_qty:number|null
  yield_unit:string|null
  is_subrecipe:boolean
  is_archived:boolean
  photo_url:string|null
  description:string|null
  calories:number|null
  protein_g:number|null
  carbs_g:number|null
  fat_g:number|null
  selling_price?:number|null
  currency?:string|null
}

function toNum(x:any,fallback=0){
 const n=Number(x)
 return Number.isFinite(n)?n:fallback
}

function fmtMoney(n:number,currency:string){
 const v=Number.isFinite(n)?n:0
 try{
  return new Intl.NumberFormat(undefined,{
   style:'currency',
   currency:(currency||'USD').toUpperCase()
  }).format(v)
 }catch{
  return `${v.toFixed(2)} USD`
 }
}

export default function Recipes(){

 const nav=useNavigate()
 const {isKitchen}=useMode()
 const isMgmt=!isKitchen

 const [recipes,setRecipes]=useState<RecipeRow[]>([])
 const [loading,setLoading]=useState(true)
 const [toast,setToast]=useState<string|null>(null)
 const [err,setErr]=useState<string|null>(null)

 async function loadAll(){

  setLoading(true)
  setErr(null)

  try{

   const {data,error}=await supabase
   .from('recipes')
   .select('*')
   .eq('kitchen_id',KITCHEN_ID)
   .order('name',{ascending:true})

   if(error)throw error

   setRecipes(data??[])

  }catch(e:any){
   setErr(e?.message||'Load failed')
  }
  finally{
   setLoading(false)
  }

 }

 useEffect(()=>{
  loadAll()
 },[])

 return(

<div className="space-y-4">

{toast && <Toast message={toast} onClose={()=>setToast(null)}/>}

{/* HEADER */}
<div className="gc-card p-5">

<div className="gc-label">RECIPES</div>

<div className="flex justify-between items-center mt-3">

<div>

<div className="text-2xl font-extrabold">
Recipe Library
</div>

<div className="text-sm text-neutral-600 mt-1">
Clean Kitopi Style — No photo overlays
</div>

</div>

<button
className="gc-btn gc-btn-primary"
onClick={()=>nav('/recipe')}
>
+ New
</button>

</div>

{err &&
<div className="mt-3 text-red-600 text-sm">
{err}
</div>
}

</div>


{/* GRID */}

<div className="
grid grid-cols-1
sm:grid-cols-2
lg:grid-cols-3
xl:grid-cols-4
gap-5
">

{loading &&

Array.from({length:8}).map((_,i)=>(
<div key={i} className="gc-menu-card">

<div className="gc-menu-hero"/>

<div className="p-4">

<div className="h-4 w-2/3 bg-neutral-200 rounded"/>

</div>

</div>
))

}

{!loading && recipes.map(r=>{

const title=r.name||'Untitled'
const cur=(r.currency||'USD').toUpperCase()

return(

<div key={r.id} className="gc-menu-card">

{/* HERO IMAGE */}
<div className="gc-menu-hero">

{r.photo_url?

<img
src={r.photo_url}
alt={title}
loading="lazy"
/>

:

<div className="
flex h-full w-full
items-center justify-center
text-sm text-neutral-500
">
No Photo
</div>

}

{/* ❌ REMOVED :
gc-menu-overlay
gc-menu-badges
chips
category text
portions
kitchen
archived badge
*/}

</div>


{/* BODY */}

<div className="gc-menu-body">

<div className="gc-menu-kicker">
Recipe
</div>

<div className="gc-menu-title">

{title}

</div>

<div className="gc-menu-desc">

{r.description?.trim()
? r.description
:'Add description…'}

</div>


<div className="gc-menu-metrics">

<div>

Price :

<b>

{r.selling_price==null
?'—'
:fmtMoney(
toNum(r.selling_price,0),
cur
)}

</b>

</div>

</div>


<div className="gc-menu-actions">

<button
className="gc-action primary"
onClick={()=>nav(`/recipe?id=${r.id}`)}
>

Open Editor

</button>


<button
className="gc-action"
onClick={()=>nav(`/recipe?id=${r.id}&view=cook`)}
>

Cook

</button>

</div>

</div>

</div>

)

})}

</div>

</div>

)

}
