@tailwind base;
@tailwind components;
@tailwind utilities;

/* =========================================================
   GastroChef — Global containment (ZERO overflow guarantee)
   UI/CSS only.

   Goals:
   - Box sizing containment
   - ZERO horizontal scroll (body & app)
   - Safe at zoom 100/110/125/150
   - Safe on wide + small screens
   ========================================================= */

/* 1) Box sizing containment */
*, *::before, *::after{ box-sizing: border-box; }

/* 2) Kill page-level horizontal scroll */
html, body{ width: 100%; max-width: 100%; overflow-x: hidden; }
html, body, #root{ height: 100%; }

/* 3) Keep body stable (no layout jumps) */
body{
  margin: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* 4) Common overflow traps */
img, video, canvas, svg{ max-width: 100%; height: auto; }
table{ max-width: 100%; }

/* 5) Prevent vw-based utilities from causing overflow */
.w-screen{ width: 100% !important; }
.min-w-\[100vw\]{ min-width: 100% !important; }

