import React,
{
useEffect,
useState,
useMemo,
useCallback
}
from "react"

import {
NavLink,
useSearchParams,
useNavigate
}
from "react-router-dom"

import { supabase } from "../lib/supabase"

import RecipeLinesPro from "../components/RecipeLinesPro"

import { Toast } from "../components/Toast"



type Recipe={

id:string
name:string
category:string|null
portions:number

photo_url?:string|null

}



export default function RecipeEditor(){

const nav=useNavigate()

const [search]=useSearchParams()

const id=search.get("id")

const [recipe,setRecipe]=useState<Recipe|null>(null)

const [loading,setLoading]=useState(true)

const [saving,setSaving]=useState(false)

const [toast,setToast]=useState<string|null>(null)



// ================= LOAD =================

useEffect(()=>{

if(!id)return

load()

async function load(){

setLoading(true)

const {data,error}=await supabase

.from("recipes")

.select("*")

.eq("id",id)

.single()

if(error){

setToast(error.message)

setLoading(false)

return

}

setRecipe(data)

setLoading(false)

}

},[id])



// ================= FAST UPDATE =================

const updateField=useCallback(

(key:keyof Recipe,value:any)=>{

setRecipe(prev=>{

if(!prev)return prev

return{

...prev,

[key]:value

}

})

},

[]

)


// ================= SAVE =================

const save=useCallback(async()=>{

if(!recipe)return

setSaving(true)

const {error}=await supabase

.from("recipes")

.update({

name:recipe.name,

category:recipe.category,

portions:recipe.portions

})

.eq("id",recipe.id)

if(error){

setToast(error.message)

}

setSaving(false)

},[recipe])



// ================= SMART AUTOSAVE =================

useEffect(()=>{

if(!recipe)return

const t=setTimeout(()=>{

save()

},1200)

return()=>clearTimeout(t)

},[
recipe?.name,
recipe?.category,
recipe?.portions
])



// ================= ERROR GUARD =================

if(loading){

return(

<div className="gc-card p-6">

Loading Recipe...

</div>

)

}

if(!recipe){

return(

<div className="gc-card p-6">

Recipe not found.

</div>

)

}



// ================= GPU MEMO =================

const memoRecipeId=

useMemo(()=>recipe.id,[recipe.id])



// ================= UI =================

return(

<div

className="space-y-6 p-6"

style={{

transform:"translateZ(0)"

}}

>

{/* ===== HEADER ===== */}

<div

className="gc-card p-6"

style={{

position:"sticky",

top:12,

zIndex:40,

backdropFilter:"blur(14px)",

transform:"translateZ(0)"

}}

>

<div className="flex flex-wrap gap-4">


<div>

<div className="gc-label">

NAME

</div>

<input

className="gc-input mt-2"

value={recipe.name ?? ""}

onChange={e=>

updateField(

"name",

e.target.value

)

}

/>

</div>



<div>

<div className="gc-label">

CATEGORY

</div>

<input

className="gc-input mt-2"

value={recipe.category ?? ""}

onChange={e=>

updateField(

"category",

e.target.value

)

}

/>

</div>



<div>

<div className="gc-label">

PORTIONS

</div>

<input

type="number"

className="gc-input mt-2"

value={recipe.portions}

onChange={e=>

updateField(

"portions",

Number(e.target.value)

)

}

/>

</div>

</div>



<div className="flex gap-3 mt-5 flex-wrap">

<button

className="gc-btn gc-btn-primary"

onClick={save}

disabled={saving}

>

{saving?"Saving...":"Save"}

</button>



<NavLink

className="gc-btn"

to={`/cook?id=${recipe.id}`}

>

🍳 Cook Mode

</NavLink>



<button

className="gc-btn"

onClick={()=>nav(-1)}

>

← Back

</button>

</div>

</div>



{/* ===== LINES ENGINE ===== */}

<div

style={{

transform:"translateZ(0)",

willChange:"transform"

}}

>

<RecipeLinesPro

recipeId={memoRecipeId}

/>

</div>



{toast &&

<Toast

message={toast}

onClose={()=>setToast(null)}

/>

}

</div>

)

}
