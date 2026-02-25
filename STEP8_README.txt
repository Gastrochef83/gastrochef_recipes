# GastroChef V4 SaaS — MVP Starter (React + Supabase)

This repo is a **starter MVP** for GastroChef V4 (SaaS):
- Auth (Login/Register)
- Multi-tenant kitchens via `kitchens` + `user_profiles` + RLS
- Ingredients CRUD with **net unit cost** auto-calculation (DB trigger)
- Recipes CRUD (header fields)
- Recipe Lines (basic editor + DB trigger for line cost)
- Recipe Card view (print-friendly layout placeholder)

> No macros, no Excel — this is the web MVP foundation.

---

## 1) Create Supabase project
1. Create a new Supabase project
2. Open SQL Editor and run:
   - `supabase/migrations/001_init.sql`
3. Enable Email/Password auth

Optional (for later):
- Storage bucket `recipe-images`

---

## 2) Configure environment
Copy `.env.example` to `.env` and set:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## 3) Install & run
```bash
npm install
npm run dev
```

---

## 4) Next build steps (recommended)
- Units conversion
- PDF export
- Image upload wiring
- Roles (owner/staff/viewer)
- Analytics charts

