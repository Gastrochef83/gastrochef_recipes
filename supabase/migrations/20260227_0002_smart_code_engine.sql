-- =========================================
-- 2026-02-27 SMART CODE ENGINE + PREFIX TRIGGERS
-- Adds editable human codes for ingredients & recipes (PREP/MENU)
-- Safe migration: additive, idempotent.
-- =========================================

-- 1) Columns
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS code TEXT;

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS code TEXT;

-- 2) Uniqueness (use indexes for idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS ingredients_code_unique
  ON public.ingredients (code);

CREATE UNIQUE INDEX IF NOT EXISTS recipes_code_unique
  ON public.recipes (code);

-- 3) Backfill any missing codes (keep existing values)
UPDATE public.ingredients
SET code = 'ING-' || UPPER(SUBSTRING(id::text, 1, 6))
WHERE code IS NULL OR BTRIM(code) = '';

UPDATE public.recipes
SET code =
  CASE
    WHEN is_subrecipe = true THEN 'PREP-' || UPPER(SUBSTRING(id::text, 1, 6))
    ELSE 'MENU-' || UPPER(SUBSTRING(id::text, 1, 6))
  END
WHERE code IS NULL OR BTRIM(code) = '';

-- 4) Sequences for numeric codes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='ingredients_code_seq') THEN
    CREATE SEQUENCE public.ingredients_code_seq START 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='prep_code_seq') THEN
    CREATE SEQUENCE public.prep_code_seq START 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='menu_code_seq') THEN
    CREATE SEQUENCE public.menu_code_seq START 1;
  END IF;
END $$;

-- 5) Helpers
CREATE OR REPLACE FUNCTION public.gc_normalize_suffix(raw text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  s text;
BEGIN
  s := COALESCE(raw, '');
  s := UPPER(BTRIM(s));
  -- Replace spaces with dashes
  s := REGEXP_REPLACE(s, '\s+', '-', 'g');
  -- Keep only A-Z 0-9 and dash
  s := REGEXP_REPLACE(s, '[^A-Z0-9-]', '', 'g');
  -- Collapse multiple dashes
  s := REGEXP_REPLACE(s, '-{2,}', '-', 'g');
  -- Trim dashes
  s := BTRIM(s, '-');
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.gc_next_code(prefix text, seq_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
BEGIN
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO n;
  RETURN prefix || LPAD(n::text, 6, '0');
END $$;

-- 6) UPGRADED PREFIX TRIGGERS (keeps full suffix, fixes split bugs)
CREATE OR REPLACE FUNCTION public.gc_enforce_ingredient_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  suffix text;
BEGIN
  IF NEW.code IS NULL OR BTRIM(NEW.code) = '' THEN
    NEW.code := public.gc_next_code('ING-', 'public.ingredients_code_seq');
    RETURN NEW;
  END IF;

  -- Strip any leading PREFIX- (letters only), keep remainder
  suffix := REGEXP_REPLACE(UPPER(BTRIM(NEW.code)), '^[A-Z]+-', '');
  suffix := public.gc_normalize_suffix(suffix);

  IF suffix = '' THEN
    NEW.code := public.gc_next_code('ING-', 'public.ingredients_code_seq');
  ELSE
    NEW.code := 'ING-' || suffix;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.gc_enforce_recipe_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prefix text;
  seq_name text;
  suffix text;
BEGIN
  IF NEW.is_subrecipe = true THEN
    prefix := 'PREP-';
    seq_name := 'public.prep_code_seq';
  ELSE
    prefix := 'MENU-';
    seq_name := 'public.menu_code_seq';
  END IF;

  IF NEW.code IS NULL OR BTRIM(NEW.code) = '' THEN
    NEW.code := public.gc_next_code(prefix, seq_name);
    RETURN NEW;
  END IF;

  -- Strip any existing leading PREFIX- (letters only), keep full remainder
  suffix := REGEXP_REPLACE(UPPER(BTRIM(NEW.code)), '^[A-Z]+-', '');
  suffix := public.gc_normalize_suffix(suffix);

  IF suffix = '' THEN
    NEW.code := public.gc_next_code(prefix, seq_name);
  ELSE
    NEW.code := prefix || suffix;
  END IF;

  RETURN NEW;
END $$;

-- 7) Attach triggers
DROP TRIGGER IF EXISTS gc_ingredient_code_trigger ON public.ingredients;
CREATE TRIGGER gc_ingredient_code_trigger
BEFORE INSERT OR UPDATE ON public.ingredients
FOR EACH ROW
EXECUTE FUNCTION public.gc_enforce_ingredient_code();

DROP TRIGGER IF EXISTS gc_recipe_code_trigger ON public.recipes;
CREATE TRIGGER gc_recipe_code_trigger
BEFORE INSERT OR UPDATE ON public.recipes
FOR EACH ROW
EXECUTE FUNCTION public.gc_enforce_recipe_code();

-- 8) Sync sequences to existing numeric codes (if any)
DO $$
DECLARE
  mx bigint;
BEGIN
  SELECT COALESCE(MAX((REGEXP_REPLACE(code, '^ING-', ''))::bigint), 0)
    INTO mx
  FROM public.ingredients
  WHERE code ~ '^ING-[0-9]{1,}$';

  IF mx > 0 THEN
    PERFORM setval('public.ingredients_code_seq', mx, true);
  END IF;

  SELECT COALESCE(MAX((REGEXP_REPLACE(code, '^PREP-', ''))::bigint), 0)
    INTO mx
  FROM public.recipes
  WHERE code ~ '^PREP-[0-9]{1,}$';

  IF mx > 0 THEN
    PERFORM setval('public.prep_code_seq', mx, true);
  END IF;

  SELECT COALESCE(MAX((REGEXP_REPLACE(code, '^MENU-', ''))::bigint), 0)
    INTO mx
  FROM public.recipes
  WHERE code ~ '^MENU-[0-9]{1,}$';

  IF mx > 0 THEN
    PERFORM setval('public.menu_code_seq', mx, true);
  END IF;
END $$;

-- 9) Optional: make codes required (enable when your app is ready)
-- ALTER TABLE public.ingredients ALTER COLUMN code SET NOT NULL;
-- ALTER TABLE public.recipes ALTER COLUMN code SET NOT NULL;
