-- GastroChef V4 MVP schema + RLS (multi-tenant by kitchen_id)

create extension if not exists pgcrypto;

create table if not exists public.kitchens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','staff','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  name text not null,
  category text,
  supplier text,
  pack_size numeric(18,6) not null check (pack_size > 0),
  pack_unit text not null,
  pack_price numeric(18,6) not null check (pack_price >= 0),
  yield_percent numeric(5,2) not null default 100 check (yield_percent > 0 and yield_percent <= 200),
  net_unit_cost numeric(18,6) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  name text not null,
  category text,
  portions numeric(18,6) not null check (portions > 0),
  selling_price numeric(18,6) not null default 0 check (selling_price >= 0),
  notes text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  qty numeric(18,6) not null check (qty >= 0),
  unit text not null,
  yield_override_percent numeric(5,2),
  unit_cost numeric(18,6) not null default 0,
  line_cost numeric(18,6) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_kitchen_id()
returns uuid
language sql stable
as $$
  select kitchen_id from public.user_profiles where user_id = auth.uid()
$$;

create or replace function public.calc_net_unit_cost()
returns trigger
language plpgsql
as $$
declare
  gross numeric(18,6);
  y numeric(18,6);
begin
  gross := NEW.pack_price / NEW.pack_size;
  y := NEW.yield_percent / 100.0;
  NEW.net_unit_cost := gross / y;
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_calc_net_unit_cost on public.ingredients;
create trigger trg_calc_net_unit_cost
before insert or update on public.ingredients
for each row execute function public.calc_net_unit_cost();

create or replace function public.calc_recipe_line_cost()
returns trigger
language plpgsql
as $$
declare
  ing_cost numeric(18,6);
  y_override numeric(18,6);
begin
  select net_unit_cost into ing_cost from public.ingredients where id = NEW.ingredient_id;

  if NEW.yield_override_percent is not null then
    y_override := NEW.yield_override_percent / 100.0;
    if y_override <= 0 then y_override := 1; end if;
    NEW.unit_cost := ing_cost / y_override;
  else
    NEW.unit_cost := ing_cost;
  end if;

  NEW.line_cost := NEW.qty * NEW.unit_cost;
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_calc_recipe_line_cost on public.recipe_lines;
create trigger trg_calc_recipe_line_cost
before insert or update on public.recipe_lines
for each row execute function public.calc_recipe_line_cost();

alter table public.kitchens enable row level security;
alter table public.user_profiles enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_lines enable row level security;

drop policy if exists kitchens_select on public.kitchens;
create policy kitchens_select on public.kitchens
for select using (id = public.current_kitchen_id());

drop policy if exists profiles_select on public.user_profiles;
create policy profiles_select on public.user_profiles
for select using (user_id = auth.uid());

drop policy if exists ingredients_all on public.ingredients;
create policy ingredients_all on public.ingredients
for all using (kitchen_id = public.current_kitchen_id())
with check (kitchen_id = public.current_kitchen_id());

drop policy if exists recipes_all on public.recipes;
create policy recipes_all on public.recipes
for all using (kitchen_id = public.current_kitchen_id())
with check (kitchen_id = public.current_kitchen_id());

drop policy if exists recipe_lines_all on public.recipe_lines;
create policy recipe_lines_all on public.recipe_lines
for all using (
  exists (select 1 from public.recipes r where r.id = recipe_id and r.kitchen_id = public.current_kitchen_id())
)
with check (
  exists (select 1 from public.recipes r where r.id = recipe_id and r.kitchen_id = public.current_kitchen_id())
);

create or replace function public.bootstrap_kitchen(kitchen_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  kid uuid;
begin
  insert into public.kitchens (name, owner_id)
  values (kitchen_name, auth.uid())
  returning id into kid;

  insert into public.user_profiles (user_id, kitchen_id, role)
  values (auth.uid(), kid, 'owner')
  on conflict (user_id) do nothing;

  return kid;
end;
$$;

revoke all on function public.bootstrap_kitchen(text) from public;
grant execute on function public.bootstrap_kitchen(text) to authenticated;
