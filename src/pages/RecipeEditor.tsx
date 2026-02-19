import React,
{
useEffect,
useMemo,
useState,
useRef,
useCallback
}
from "react"

import { NavLink,useSearchParams,useNavigate }
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

const [toast,setToast]=useState<string|null>(null)

const [saving,setSaving]=useState(false)


// ---------- LOAD ----------

useEffect(()=>{

if(!id)return

load()

async function load(){

const {data,error}=await supabase

.from("recipes")

.select("*")

.eq("id",id)

.single()

if(error){

setToast(error.message)

return

}

setRecipe(data)

}

},[id])


// ---------- FAST HEADER STATE ----------

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


// ---------- SAVE ----------

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



// ---------- SMART AUTOSAVE ----------

useEffect(()=>{

if(!recipe)return

const timer=setTimeout(()=>{

save()

},1100)

return()=>clearTimeout(timer)

},[
recipe?.name,
recipe?.category,
recipe?.portions
])


// ---------- GPU RECIPE ID ----------

const memoRecipeId=

useMemo(

()=>recipe?.id,

[recipe?.id]

)



if(!recipe){

return(

<div className="gc-card p-6">

Loading Recipe...

</div>

)

}



// ---------- UI ----------

return(

<div
className="space-y-6 p-6"
style={{

transform:"translateZ(0)"

}}
>

{/* GOD HEADER */}

<div

className="gc-card p-6"

style={{

position:"sticky",

top:12,

zIndex:30,

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



<div className="flex gap-3 mt-4">

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

🍳 START COOK MODE

</NavLink>


<button

className="gc-btn"

onClick={()=>nav(-1)}

>

← Back

</button>

</div>

</div>



{/* GPU LINES */}

<div

style={{

transform:"translateZ(0)",

willChange:"transform"

}}

>

{memoRecipeId &&

<RecipeLinesPro

recipeId={memoRecipeId}

/>

}

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
