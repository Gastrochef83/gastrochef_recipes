-- =========================================
-- 2026-02-27 ADMIN-ONLY CODE EDIT
-- Prevent non-owners from changing code / code_category on UPDATE.
-- Works with existing kitchen tenancy model (public.user_profiles).
-- Safe: additive, idempotent.
-- =========================================

-- Helper: check if current user is owner of the row's kitchen
CREATE OR REPLACE FUNCTION public.gc_is_owner(p_kitchen_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.kitchen_id = p_kitchen_id
      AND up.role = 'owner'
  );
$$;

-- INGREDIENTS: block non-owner code changes
CREATE OR REPLACE FUNCTION public.gc_block_ingredient_code_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only enforce on UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.gc_is_owner(NEW.kitchen_id) THEN
      IF (NEW.code IS DISTINCT FROM OLD.code) OR (NEW.code_category IS DISTINCT FROM OLD.code_category) THEN
        RAISE EXCEPTION 'Only Owner can modify code fields';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gc_block_ingredient_code_update_trg ON public.ingredients;
CREATE TRIGGER gc_block_ingredient_code_update_trg
BEFORE UPDATE ON public.ingredients
FOR EACH ROW
EXECUTE FUNCTION public.gc_block_ingredient_code_update();

-- RECIPES: block non-owner code changes
CREATE OR REPLACE FUNCTION public.gc_block_recipe_code_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.gc_is_owner(NEW.kitchen_id) THEN
      IF (NEW.code IS DISTINCT FROM OLD.code) OR (NEW.code_category IS DISTINCT FROM OLD.code_category) THEN
        RAISE EXCEPTION 'Only Owner can modify code fields';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gc_block_recipe_code_update_trg ON public.recipes;
CREATE TRIGGER gc_block_recipe_code_update_trg
BEFORE UPDATE ON public.recipes
FOR EACH ROW
EXECUTE FUNCTION public.gc_block_recipe_code_update();
