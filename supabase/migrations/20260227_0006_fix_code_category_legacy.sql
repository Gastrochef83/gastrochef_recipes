-- =========================================
-- FIX: Legacy codes should NOT poison code_category
-- - If code is not TYPE-CAT-NNNNNN, code_category should come from:
--   1) explicit NEW.code_category (normalized)
--   2) Category field (normalized)
-- - Preserve full user code; only ensure correct TYPE prefix.
-- =========================================

-- Helper reused from v2 (create if missing)
CREATE OR REPLACE FUNCTION gc_norm_cat(input TEXT)
RETURNS TEXT AS $$
DECLARE
  v TEXT;
BEGIN
  v := UPPER(COALESCE(input, 'GEN'));
  v := REGEXP_REPLACE(v, '[^A-Z0-9]+', '', 'g');
  IF v = '' THEN v := 'GEN'; END IF;
  IF LENGTH(v) > 6 THEN v := SUBSTRING(v, 1, 6); END IF;
  RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Upgrade trigger function (idempotent)
CREATE OR REPLACE FUNCTION gc_enforce_codes_v2()
RETURNS trigger AS $$
DECLARE
  v_type TEXT;
  v_cat  TEXT;
  v_num  BIGINT;
  v_code TEXT;
  v_match TEXT[];
BEGIN
  -- Decide type
  IF TG_TABLE_NAME = 'recipes' THEN
    v_type := CASE WHEN NEW.is_subrecipe = true THEN 'PREP' ELSE 'MENU' END;
    v_cat := COALESCE(NULLIF(NEW.code_category, ''), NEW.category, 'GEN');
  ELSE
    v_type := 'ING';
    v_cat := COALESCE(NULLIF(NEW.code_category, ''), NEW.category, 'GEN');
  END IF;

  -- Auto-generate if missing
  IF NEW.code IS NULL OR BTRIM(NEW.code) = '' THEN
    -- gc_next_counter + gc_build_code should already exist from v2.
    v_num := gc_next_counter(v_type, v_cat);
    NEW.code := gc_build_code(v_type, v_cat, v_num);
    NEW.code_category := gc_norm_cat(v_cat);
    RETURN NEW;
  END IF;

  -- Normalize code casing
  v_code := UPPER(BTRIM(NEW.code));

  -- Ensure correct TYPE prefix, but keep full suffix
  IF v_code NOT LIKE v_type || '-%' THEN
    v_code := REGEXP_REPLACE(v_code, '^(ING|PREP|MENU)\-', '', 'i');
    NEW.code := v_type || '-' || v_code;
  ELSE
    NEW.code := v_code;
  END IF;

  -- Derive code_category ONLY when code matches TYPE-CAT-NNNNNN
  -- otherwise keep explicit NEW.code_category if provided, else use Category.
  v_match := regexp_match(NEW.code, '^(ING|PREP|MENU)-([A-Z0-9]{1,6})-([0-9]{6})$');
  IF v_match IS NOT NULL THEN
    NEW.code_category := v_match[2];
  ELSE
    IF NEW.code_category IS NOT NULL AND BTRIM(NEW.code_category) <> '' THEN
      NEW.code_category := gc_norm_cat(NEW.code_category);
    ELSE
      NEW.code_category := gc_norm_cat(v_cat);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Keep triggers attached (safe)
DROP TRIGGER IF EXISTS gc_codes_v2_ingredients ON ingredients;
CREATE TRIGGER gc_codes_v2_ingredients
BEFORE INSERT OR UPDATE ON ingredients
FOR EACH ROW EXECUTE FUNCTION gc_enforce_codes_v2();

DROP TRIGGER IF EXISTS gc_codes_v2_recipes ON recipes;
CREATE TRIGGER gc_codes_v2_recipes
BEFORE INSERT OR UPDATE ON recipes
FOR EACH ROW EXECUTE FUNCTION gc_enforce_codes_v2();

-- Cleanup existing poisoned code_category for legacy one-dash codes
UPDATE ingredients
SET code_category = gc_norm_cat(COALESCE(category, 'GEN'))
WHERE code IS NOT NULL
  AND code LIKE 'ING-%'
  AND code NOT LIKE 'ING-%-%'
  AND (code_category IS NULL OR code_category = SUBSTRING(code FROM 5));

UPDATE recipes
SET code_category = gc_norm_cat(COALESCE(category, 'GEN'))
WHERE code IS NOT NULL
  AND (code LIKE 'PREP-%' OR code LIKE 'MENU-%')
  AND code NOT LIKE 'PREP-%-%'
  AND code NOT LIKE 'MENU-%-%'
  AND (code_category IS NULL OR code_category = SUBSTRING(code FROM 6));
