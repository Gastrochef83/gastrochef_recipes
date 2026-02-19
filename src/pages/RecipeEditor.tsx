import { useEffect,useState } from "react"

import {
NavLink,
useSearchParams,
useNavigate
}
from "react-router-dom"

import { supabase } from "../lib/supabase"

import { Toast } from "../components/Toast"


// SAFE IMPORT
let RecipeLinesPro:any=null

try{

RecipeLinesPro=require("../components/RecipeLinesPro").default

}catch(e){

console.warn("RecipeLinesPro missing")

}



type Recipe={

id:string
name:string|null
category:string|null
portions:number

}



export default function RecipeEditor(){

const nav=useNavigate()

const [sp]=useSearchParams()

const id=sp.get("id")

const [recipe,setRecipe]=useState<Recipe|null>(null)

const [loading,setLoading]=useState(true)

const [toast,setToast]=useState<string|null>(null)



// LOAD

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



async function save(){

if(!recipe)return

await supabase

.from("recipes")

.update({

name:recipe.name,

category:recipe.category,

portions:recipe.portions

})

.eq("id",recipe.id)

}



if(loading){

return<div className="gc-card p-6">

Loading...

</div>

}



if(!recipe){

return<div className="gc-card p-6">

Recipe Missing

</div>

}



return(

<div className="space-y-6 p-6">


<div className="gc-card p-6">

<div className="gc-label">

OMEGA V8.5 FINAL FORM

</div>


<input

className="gc-input mt-2"

value={recipe.name ?? ""}

onChange={e=>

setRecipe({

...recipe,

name:e.target.value

})

}

/>


<input

className="gc-input mt-2"

value={recipe.category ?? ""}

onChange={e=>

setRecipe({

...recipe,

category:e.target.value

})

}

/>


<input

type="number"

className="gc-input mt-2"

value={recipe.portions}

onChange={e=>

setRecipe({

...recipe,

portions:Number(e.target.value)

})

}

/>



<div className="flex gap-3 mt-4">

<button

className="gc-btn gc-btn-primary"

onClick={save}

>

Save

</button>



<NavLink

className="gc-btn"

to={`/cook?id=${recipe.id}`}

>

Cook Mode

</NavLink>


<button

className="gc-btn"

onClick={()=>nav(-1)}

>

Back

</button>

</div>

</div>



{/* SAFE LINES */}

<div className="gc-card p-6">

{RecipeLinesPro ?

<RecipeLinesPro recipeId={recipe.id}/>

:

<div>

RecipeLinesPro missing.

Fix component path.

</div>

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
