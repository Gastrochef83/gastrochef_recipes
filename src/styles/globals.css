/* styles/globals.css - Unified token system with premium feel */
:root {
  /* Light theme tokens */
  --light-primary: #2563eb;
  --light-primary-hover: #1d4ed8;
  --light-secondary: #64748b;
  --light-success: #10b981;
  --light-warning: #f59e0b;
  --light-danger: #ef4444;
  --light-surface: #ffffff;
  --light-surface-secondary: #f8fafc;
  --light-surface-tertiary: #f1f5f9;
  --light-text-primary: #0f172a;
  --light-text-secondary: #475569;
  --light-text-tertiary: #64748b;
  --light-border: #e2e8f0;
  --light-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --light-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --light-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  
  /* Dark theme tokens */
  --dark-primary: #3b82f6;
  --dark-primary-hover: #60a5fa;
  --dark-secondary: #94a3b8;
  --dark-success: #34d399;
  --dark-warning: #fbbf24;
  --dark-danger: #f87171;
  --dark-surface: #0f172a;
  --dark-surface-secondary: #1e293b;
  --dark-surface-tertiary: #334155;
  --dark-text-primary: #f8fafc;
  --dark-text-secondary: #cbd5e1;
  --dark-text-tertiary: #94a3b8;
  --dark-border: #334155;
  --dark-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
  --dark-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
  --dark-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.4);
}

[data-theme="light"] {
  --primary: var(--light-primary);
  --primary-hover: var(--light-primary-hover);
  --secondary: var(--light-secondary);
  --success: var(--light-success);
  --warning: var(--light-warning);
  --danger: var(--light-danger);
  --surface: var(--light-surface);
  --surface-secondary: var(--light-surface-secondary);
  --surface-tertiary: var(--light-surface-tertiary);
  --text-primary: var(--light-text-primary);
  --text-secondary: var(--light-text-secondary);
  --text-tertiary: var(--light-text-tertiary);
  --border: var(--light-border);
  --shadow-sm: var(--light-shadow-sm);
  --shadow-md: var(--light-shadow-md);
  --shadow-lg: var(--light-shadow-lg);
}

[data-theme="dark"] {
  --primary: var(--dark-primary);
  --primary-hover: var(--dark-primary-hover);
  --secondary: var(--dark-secondary);
  --success: var(--dark-success);
  --warning: var(--dark-warning);
  --danger: var(--dark-danger);
  --surface: var(--dark-surface);
  --surface-secondary: var(--dark-surface-secondary);
  --surface-tertiary: var(--dark-surface-tertiary);
  --text-primary: var(--dark-text-primary);
  --text-secondary: var(--dark-text-secondary);
  --text-tertiary: var(--dark-text-tertiary);
  --border: var(--dark-border);
  --shadow-sm: var(--dark-shadow-sm);
  --shadow-md: var(--dark-shadow-md);
  --shadow-lg: var(--dark-shadow-lg);
}

/* Base styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: var(--surface);
  color: var(--text-primary);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--surface-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--text-tertiary);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* Focus styles */
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* Print styles */
@media print {
  body {
    background: white;
    color: black;
  }
  
  .no-print {
    display: none !important;
  }
}
/* --- App shell --- */
.gc-app{display:flex;min-height:100vh;background:var(--bg);color:var(--text-primary);} 
.gc-sidebar{width:260px;background:var(--surface);border-right:1px solid var(--border);padding:16px;display:flex;flex-direction:column;gap:16px;}
.gc-main{flex:1;min-width:0;padding:24px;}
.gc-brand{display:flex;align-items:center;gap:12px;}
.gc-brand__logo{width:40px;height:40px;border-radius:12px;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-weight:800;}
.gc-brand__name{font-weight:800;}
.gc-brand__sub{color:var(--text-tertiary);font-size:12px;}
.gc-nav{display:flex;flex-direction:column;gap:6px;}
.gc-nav__item{padding:10px 12px;border-radius:12px;color:var(--text-secondary);text-decoration:none;border:1px solid transparent;background:transparent;cursor:pointer;text-align:left;}
.gc-nav__item:hover{background:var(--surface-secondary);color:var(--text-primary);} 
.gc-nav__item.is-active{background:var(--surface-tertiary);color:var(--text-primary);border-color:var(--border);} 
.gc-nav__danger{color:var(--danger);} 
.gc-sidebar__footer{margin-top:auto;display:flex;flex-direction:column;gap:8px;}
.gc-user{font-size:12px;color:var(--text-tertiary);padding:0 4px;}

/* --- Common UI --- */
.gc-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-sm);} 
.gc-btn{border:1px solid var(--border);border-radius:12px;padding:10px 12px;font-weight:600;cursor:pointer;transition:all .15s;}
.gc-btn--primary{background:var(--primary);border-color:transparent;color:white;}
.gc-btn--primary:hover{background:var(--primary-hover);} 
.gc-btn--secondary{background:var(--surface-secondary);color:var(--text-primary);} 
.gc-btn--secondary:hover{background:var(--surface-tertiary);} 
.gc-btn--danger{background:var(--danger);border-color:transparent;color:white;}
.gc-btn--ghost{background:transparent;color:var(--text-secondary);} 
.gc-btn--ghost:hover{background:var(--surface-secondary);} 
.gc-btn--full{width:100%;}

.gc-field{display:flex;flex-direction:column;gap:6px;}
.gc-field__label{font-size:12px;color:var(--text-tertiary);}
.gc-field__error{font-size:12px;color:var(--danger);}
.gc-inputwrap{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:0 10px;}
.gc-input{width:100%;border:0;outline:0;background:transparent;color:var(--text-primary);padding:10px 0;}
.gc-affix{color:var(--text-tertiary);font-size:12px;}
.gc-select{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px;color:var(--text-primary);} 
.gc-textarea{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;color:var(--text-primary);} 
.gc-muted{color:var(--text-tertiary);} 

.gc-loading{display:flex;align-items:center;justify-content:center;min-height:40vh;}
.gc-spinner{width:42px;height:42px;border-radius:999px;border:4px solid var(--border);border-top-color:var(--primary);animation:spin 1s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}

/* --- Dashboard / recipes --- */
.dashboard{max-width:1400px;margin:0 auto;}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.dashboard-grid{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:16px;}
.chart-section,.recipes-section{padding:16px;}
.gc-kpi{padding:14px;}
.gc-kpi__top{display:flex;justify-content:space-between;gap:12px;}
.gc-kpi__title{font-size:12px;color:var(--text-tertiary);}
.gc-kpi__value{font-size:22px;font-weight:800;color:var(--text-primary);}
.gc-kpi__trend{margin-top:8px;font-size:12px;color:var(--text-tertiary);} 
.gc-kpi__trend.up{color:var(--success);} 
.gc-kpi__trend.down{color:var(--warning);} 
.gc-warning{margin-top:16px;padding:12px;border-radius:12px;background:var(--surface-secondary);border:1px solid var(--border);} 

.recipes-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.gc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}
.gc-recipecard{padding:14px;text-decoration:none;color:inherit;}
.gc-recipecard__title{font-weight:800;}
.gc-recipecard__meta{color:var(--text-tertiary);font-size:12px;margin-top:6px;}

.gc-list{display:flex;flex-direction:column;gap:10px;}
.gc-list__item{padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:var(--surface);text-decoration:none;color:inherit;}
.gc-list__item:hover{background:var(--surface-secondary);} 
.gc-list__title{font-weight:700;}
.gc-list__meta{font-size:12px;color:var(--text-tertiary);} 

/* --- Recipe editor --- */
.recipe-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px;}
.recipe-title{margin:0;font-size:28px;}
.recipe-header__right{display:flex;gap:12px;}
.gc-metric{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:12px 14px;min-width:160px;}
.gc-metric__label{font-size:12px;color:var(--text-tertiary);} 
.gc-metric__value{font-size:18px;font-weight:800;}
.ingredients-table{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px;}
.table-container{overflow:auto;border-radius:12px;border:1px solid var(--border);}
.ingredients-table table{width:100%;border-collapse:separate;border-spacing:0;min-width:860px;}
.ingredients-table th,.ingredients-table td{padding:10px;border-bottom:1px solid var(--border);vertical-align:middle;}
.ingredients-table th{position:sticky;top:0;background:var(--surface-secondary);text-align:left;font-size:12px;color:var(--text-tertiary);} 
.ingredients-table td.cost{font-weight:700;}
.table-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap;}
.cost-summary{color:var(--text-secondary);font-size:13px;display:flex;gap:16px;flex-wrap:wrap;}
.gc-tabs{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;}
.tab-panel{margin-top:14px;}
.gc-panel{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;}
.gc-panel__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:12px 0;}
.gc-panel__card{background:var(--surface-secondary);border:1px solid var(--border);border-radius:14px;padding:12px;}
.gc-panel__label{font-size:12px;color:var(--text-tertiary);} 
.gc-panel__value{font-weight:800;font-size:18px;}
.gc-table table{width:100%;border-collapse:collapse;}
.gc-table th,.gc-table td{padding:10px;border-bottom:1px solid var(--border);} 
.gc-table .right{text-align:right;}
.gc-row{margin-top:12px;display:flex;justify-content:flex-end;}

/* --- Cost history --- */
.cost-history .controls{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;}
.insight-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px;}
.insight-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px;}
.insight-card .value{font-size:18px;font-weight:800;}

@media (max-width: 1024px){
  .kpi-grid{grid-template-columns:repeat(2,1fr);} 
  .dashboard-grid{grid-template-columns:1fr;} 
  .gc-panel__grid{grid-template-columns:1fr;} 
  .insight-grid{grid-template-columns:repeat(2,1fr);} 
  .recipe-header{flex-direction:column;} 
}
@media (max-width: 640px){
  .gc-main{padding:16px;} 
  .gc-sidebar{width:220px;} 
  .insight-grid{grid-template-columns:1fr;} 
}
