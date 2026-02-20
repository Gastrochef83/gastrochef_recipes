import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {

  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')

  async function handleLogin(e:any){

    e.preventDefault()

    const {error}=await supabase.auth.signInWithPassword({

      email,
      password

    })

    if(error){

      alert(error.message)

    }

  }

  return (

<div className="min-h-screen flex items-center justify-center bg-[#f4f7f9]">

<div className="w-[420px] text-center">

{/* LOGO */}

<h1 className="gc-brand">

Gastro<span>Chef</span>

</h1>

<p className="gc-brand-sub">

Sign in to your kitchen workspace

</p>

<form
onSubmit={handleLogin}
className="gc-login-card mt-8"
>

<input

placeholder="Email"

value={email}

onChange={e=>setEmail(e.target.value)}

className="gc-input"

/>

<input

type="password"

placeholder="Password"

value={password}

onChange={e=>setPassword(e.target.value)}

className="gc-input"

/>

<button

type="submit"

className="gc-login-btn"

>

Login

</button>

</form>

</div>

</div>

)

}
