@tailwind base;
@tailwind components;
@tailwind utilities;

/* ------------------------------------
   GastroChef v4 — Minimal Luxury UI
   (safe, no logic changes)
------------------------------------ */

:root {
  color-scheme: light;
}

html,
body {
  height: 100%;
}

body {
  @apply bg-neutral-50 text-neutral-900;
}

/* App containers */
.container-app {
  @apply mx-auto max-w-6xl px-4 py-6;
}

/* Cards */
.gc-card {
  @apply rounded-3xl border border-neutral-200 bg-white shadow-sm;
}

/* Labels */
.gc-label {
  @apply text-[11px] font-extrabold tracking-widest text-neutral-500;
}

/* Inputs */
.gc-input {
  @apply rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition;
}
.gc-input:focus {
  @apply border-neutral-400 ring-2 ring-neutral-200;
}

/* Buttons */
.gc-btn {
  @apply inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-extrabold transition;
}
.gc-btn-primary {
  @apply bg-neutral-900 text-white hover:bg-neutral-800;
}
.gc-btn-ghost {
  @apply border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50;
}

/* KPI blocks */
.gc-kpi {
  @apply rounded-3xl border border-neutral-200 bg-neutral-50 p-4;
}
.gc-kpi-label {
  @apply text-[11px] font-extrabold tracking-widest text-neutral-500;
}
.gc-kpi-value {
  @apply mt-2 text-xl font-extrabold;
}

/* Mode Pill */
.gc-mode-pill {
  @apply rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm;
}
.gc-mode-switch {
  @apply mt-3 grid grid-cols-2 gap-2;
}
.gc-mode-btn {
  @apply rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm font-extrabold text-neutral-700 hover:bg-neutral-50;
}
.gc-mode-btn-active {
  @apply bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800;
}

/* Small helpers */
.gc-muted {
  @apply text-sm text-neutral-600;
}
