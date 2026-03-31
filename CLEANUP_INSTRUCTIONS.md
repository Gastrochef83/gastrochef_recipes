# 🧹 Cleanup Instructions

## Files to Delete

The following files should be deleted from the repository as they are duplicates or unnecessary:

### README Files (Duplicate Content)
```bash
# Delete these - content merged into main README.md
git rm "README (1).md"
git rm "README (2).md"
git rm "STEP7_README.txt"
git rm "STEP8_README.txt"
git rm "TEST"
```

### Package Manager Conflicts
```bash
# Delete these - using npm only
git rm .yarnrc
git rm .pnpmrc
git rm yarn.lock
```

### Unknown/Unnecessary Files
```bash
# Delete if not used
git rm fgws
```

### CSS Files (Consolidate)
```bash
# Review and consolidate these:
# - globals.css
# - index.css  
# - styles.css
# Keep only what's needed in src/styles/
```

## Files to Keep

```
✅ docs/
✅ public/
✅ scripts/ (nuclear_build.ps1, nuclear_build.sh)
✅ src/
✅ supabase/migrations/
✅ .env.example (NEW)
✅ .gitignore (UPDATED)
✅ .npmrc
✅ .nvmrc
✅ 001_init.sql
✅ NUCLEAR_MASTER_PROMPT.txt
✅ README.md (NEW - replaces old ones)
✅ demo_wow_recipes.json
✅ gastrochef-icon-512.png
✅ gastrochef-logo.png
✅ index.html
✅ logo.svg
✅ package-lock.json
✅ package.json
✅ postcss.config.cjs
✅ tailwind.config.cjs
✅ tsconfig.json
✅ tsconfig.node.json
✅ vercel.json
✅ vite.config.ts
```

## Steps to Apply Cleanup

### 1. Backup First
```bash
cd gastrochef_recipes
git checkout -b cleanup-branch
```

### 2. Copy New Files
```bash
# Copy the new files from this cleanup folder
cp /path/to/gastrochef-clean/README.md ./
cp /path/to/gastrochef-clean/.env.example ./
cp /path/to/gastrochef-clean/.gitignore ./
```

### 3. Delete Unnecessary Files
```bash
git rm "README (1).md"
git rm "README (2).md"
git rm "STEP7_README.txt"
git rm "STEP8_README.txt"
git rm "TEST"
git rm .yarnrc
# git rm .pnpmrc  # Only if exists
git rm yarn.lock
# git rm fgws     # Only if not used
```

### 4. Commit Changes
```bash
git add .
git commit -m "🧹 Cleanup: organize files, update README, remove duplicates"
git push origin cleanup-branch
```

### 5. Create Pull Request
Open a PR on GitHub to merge cleanup-branch into main.

---

## Result

After cleanup, your repository will have:
- ✅ Single, comprehensive README.md
- ✅ Clear environment configuration
- ✅ No duplicate files
- ✅ Consistent package manager (npm)
- ✅ Professional structure
