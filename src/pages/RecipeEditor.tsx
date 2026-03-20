// src/pages/RecipeEditor.tsx
// ... (باقي الاستيرادات والأنواع والدوال المساعدة تبقى كما هي)

// ===== STYLES (DEFINED AT TOP TO AVOID HOISTING ISSUES) =====

const loadingStyles = `
.ik-loading {
  min-height: 100vh;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ik-loading-inner {
  text-align: center;
  padding: 40px;
}

.ik-loading-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid #E2E8F0;
  border-top-color: #475569;
  border-radius: 50%;
  animation: ik-spin 0.8s linear infinite;
  margin: 0 auto 24px;
}

@keyframes ik-spin {
  to { transform: rotate(360deg); }
}

.ik-loading-text {
  font-size: 1.125rem;
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
}

.ik-loading-bar {
  width: 200px;
  height: 2px;
  background: #E2E8F0;
  border-radius: 1px;
  overflow: hidden;
  margin: 0 auto;
}

.ik-loading-progress {
  height: 100%;
  background: linear-gradient(90deg, #475569, #94A3B8);
  animation: ik-progress 1.5s ease-in-out infinite;
}

@keyframes ik-progress {
  0% { width: 0; transform: translateX(0); }
  50% { width: 70%; }
  100% { width: 100%; transform: translateX(0); }
}

.ik-error-page {
  min-height: 100vh;
  background: #FFFFFF;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}

.ik-error-icon {
  font-size: 4rem;
  margin-bottom: 24px;
}

.ik-error-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #DC2626;
  margin-bottom: 8px;
  letter-spacing: 0.05em;
}

.ik-error-text {
  color: #64748B;
}
`

const mainStyles = `
/* ===== Slate Professional Design System ===== */
:root {
  --ik-bg: #FFFFFF;
  --ik-bg-elevated: #FAFBFC;
  --ik-bg-card: #FFFFFF;
  --ik-surface: #F8FAFC;
  --ik-surface-hover: #F1F5F9;
  --ik-border: #E2E8F0;
  --ik-border-light: #F1F5F9;
  --ik-text: #1E293B;
  --ik-text-secondary: #475569;
  --ik-text-muted: #94A3B8;
  --ik-primary: #475569;
  --ik-primary-hover: #334155;
  --ik-primary-light: #F1F5F9;
  --ik-secondary: #94A3B8;
  --ik-accent: #3B82F6;
  --ik-accent-light: #DBEAFE;
  --ik-success: #10B981;
  --ik-success-light: #D1FAE5;
  --ik-danger: #DC2626;
  --ik-danger-light: #FEE2E2;
  --ik-warning: #F59E0B;
  --ik-warning-light: #FEF3C7;
  --ik-radius: 6px;
  --ik-radius-lg: 12px;
  --ik-radius-xl: 16px;
  --ik-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --ik-shadow-md: 0 4px 6px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.03);
  --ik-shadow-lg: 0 10px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04);
  --ik-transition: all 0.2s ease;
}

* { box-sizing: border-box; }

.ik-app {
  display: flex;
  min-height: 100vh;
  background: var(--ik-bg);
  color: var(--ik-text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ===== Sidebar ===== */
.ik-sidebar {
  width: 260px;
  background: var(--ik-bg-card);
  border-right: 1px solid var(--ik-border);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.ik-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--ik-border);
}

.ik-back-link {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ik-surface);
  border-radius: var(--ik-radius);
  color: var(--ik-text-secondary);
  transition: var(--ik-transition);
  text-decoration: none;
  border: 1px solid var(--ik-border);
}

.ik-back-link:hover {
  background: var(--ik-primary);
  border-color: var(--ik-primary);
  color: #FFFFFF;
}

.ik-recipe-badge {
  padding: 6px 12px;
  background: var(--ik-primary-light);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-primary);
}

.ik-sidebar-title {
  padding: 20px;
  border-bottom: 1px solid var(--ik-border);
}

.ik-sidebar-title h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ik-text);
  margin: 0 0 8px;
  line-height: 1.3;
}

.ik-autosave {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--ik-text-muted);
}

.ik-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ik-success);
}

.ik-status-dot.saving {
  background: var(--ik-warning);
  animation: ik-pulse 1s infinite;
}

@keyframes ik-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ===== Navigation ===== */
.ik-nav {
  flex: 1;
  padding: 12px;
}

.ik-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: var(--ik-transition);
  text-align: left;
  margin-bottom: 4px;
}

.ik-nav-item:hover {
  background: var(--ik-surface);
  color: var(--ik-text);
}

.ik-nav-item.active {
  background: var(--ik-primary);
  color: #FFFFFF;
}

.ik-nav-icon {
  font-size: 1rem;
  opacity: 0.8;
}

.ik-sidebar-actions {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--ik-border);
}

.ik-action-btn {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-secondary);
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-action-btn:hover {
  background: var(--ik-primary);
  border-color: var(--ik-primary);
  color: #FFFFFF;
}

.ik-sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--ik-border);
}

.ik-density-btn {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-density-btn:hover {
  border-color: var(--ik-primary);
  color: var(--ik-primary);
}

/* ===== Main Content ===== */
.ik-main {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
  background: var(--ik-bg);
}

.ik-section {
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius-lg);
  margin-bottom: 24px;
  overflow: hidden;
  box-shadow: var(--ik-shadow);
}

.ik-section-dark {
  background: var(--ik-surface);
}

.ik-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--ik-border);
  background: var(--ik-bg-card);
}

.ik-section-title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--ik-primary);
  margin: 0;
}

.ik-currency-tag {
  padding: 4px 10px;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--ik-text-secondary);
}

/* ===== Error Banner ===== */
.ik-error-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--ik-danger-light);
  border: 1px solid #FECACA;
  border-radius: var(--ik-radius-lg);
  margin-bottom: 24px;
  color: var(--ik-danger);
  font-size: 0.875rem;
}

.ik-error-icon-sm {
  font-size: 1.25rem;
}

.ik-error-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--ik-danger);
  cursor: pointer;
  opacity: 0.7;
  transition: var(--ik-transition);
}

.ik-error-close:hover { opacity: 1; }

/* ===== KPI Grid ===== */
.ik-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--ik-border);
}

.ik-kpi {
  background: var(--ik-bg-card);
  padding: 24px;
}

.ik-kpi-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-text-muted);
  margin-bottom: 8px;
}

.ik-kpi-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--ik-text);
  font-variant-numeric: tabular-nums;
}

.ik-kpi-value.negative {
  color: var(--ik-danger);
}

.ik-warning-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: var(--ik-danger-light);
  border-top: 1px solid var(--ik-border);
  font-size: 0.875rem;
  color: var(--ik-danger);
}

/* ===== Forms ===== */
.ik-form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  padding: 24px;
}

.ik-field { margin-bottom: 16px; }
.ik-field:last-child { margin-bottom: 0; }

.ik-span-2 { grid-column: span 2; }

.ik-flex-2 { flex: 2; }
.ik-flex-3 { flex: 3; }

.ik-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--ik-text-secondary);
  margin-bottom: 8px;
}

.ik-label-sm {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ik-text-muted);
  margin-bottom: 4px;
  display: block;
}

.ik-input,
.ik-select,
.ik-textarea {
  width: 100%;
  padding: 12px 16px;
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text);
  font-size: 0.875rem;
  font-family: inherit;
  transition: var(--ik-transition);
}

.ik-input:hover,
.ik-select:hover,
.ik-textarea:hover {
  border-color: var(--ik-secondary);
}

.ik-input:focus,
.ik-select:focus,
.ik-textarea:focus {
  outline: none;
  border-color: var(--ik-primary);
  box-shadow: 0 0 0 3px rgba(71, 85, 105, 0.1);
}

.ik-input::placeholder,
.ik-textarea::placeholder {
  color: var(--ik-text-muted);
}

.ik-input-lg {
  padding: 16px;
  font-size: 1rem;
  font-weight: 600;
}

.ik-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394A3B8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
  padding-right: 40px;
  cursor: pointer;
}

.ik-textarea {
  min-height: 100px;
  resize: vertical;
  line-height: 1.5;
}

/* ===== Subrecipe Toggle ===== */
.ik-subrecipe-toggle {
  padding: 0 24px 24px;
}

.ik-toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.ik-toggle {
  display: none;
}

.ik-toggle-slider {
  width: 44px;
  height: 24px;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: 12px;
  position: relative;
  transition: var(--ik-transition);
}

.ik-toggle-slider::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: var(--ik-text-muted);
  border-radius: 50%;
  transition: var(--ik-transition);
}

.ik-toggle:checked + .ik-toggle-slider {
  background: var(--ik-primary);
  border-color: var(--ik-primary);
}

.ik-toggle:checked + .ik-toggle-slider::after {
  left: 23px;
  background: #FFFFFF;
}

.ik-toggle-text {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--ik-text-secondary);
}

.ik-subrecipe-fields {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ik-border);
}

.ik-subrecipe-fields .ik-field {
  flex: 1;
  margin: 0;
}

/* ===== Photo Section ===== */
.ik-photo-section {
  padding: 0 24px 24px;
}

.ik-photo-upload {
  margin-top: 8px;
}

.ik-photo-preview {
  position: relative;
  width: 160px;
  height: 120px;
  border-radius: var(--ik-radius);
  overflow: hidden;
  border: 1px solid var(--ik-border);
}

.ik-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ik-photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(71, 85, 105, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: var(--ik-transition);
}

.ik-photo-preview:hover .ik-photo-overlay {
  opacity: 1;
}

.ik-photo-change {
  padding: 8px 16px;
  background: #FFFFFF;
  border-radius: var(--ik-radius);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ik-primary);
  cursor: pointer;
}

.ik-photo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 160px;
  height: 120px;
  background: var(--ik-surface);
  border: 2px dashed var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-photo-placeholder:hover {
  border-color: var(--ik-primary);
  color: var(--ik-primary);
  background: var(--ik-primary-light);
}

.ik-photo-placeholder span {
  font-size: 0.75rem;
}

.ik-uploading {
  margin-top: 8px;
  font-size: 0.75rem;
  color: var(--ik-primary);
}

.hidden { display: none; }

/* ===== Type Tabs ===== */
.ik-type-tabs {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--ik-border);
  background: var(--ik-surface);
}

.ik-type-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-type-tab:hover {
  border-color: var(--ik-primary);
  color: var(--ik-primary);
}

.ik-type-tab.active {
  background: var(--ik-primary);
  border-color: var(--ik-primary);
  color: #FFFFFF;
}

/* ===== Add Row ===== */
.ik-add-row {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
}

.ik-add-row .ik-field {
  flex: 1;
  margin: 0;
}

.ik-add-actions {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  justify-content: flex-end;
  border-top: 1px solid var(--ik-border);
  background: var(--ik-bg-card);
}

/* ===== Buttons ===== */
.ik-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--ik-radius);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--ik-transition);
  border: none;
  font-family: inherit;
}

.ik-btn-primary {
  background: var(--ik-primary);
  color: #FFFFFF;
}

.ik-btn-primary:hover {
  background: var(--ik-primary-hover);
}

.ik-btn-secondary {
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  color: var(--ik-text);
}

.ik-btn-secondary:hover {
  border-color: var(--ik-primary);
  color: var(--ik-primary);
}

.ik-btn-sm {
  padding: 8px 16px;
  font-size: 0.75rem;
}

/* ===== Table ===== */
.ik-table-wrapper {
  overflow-x: auto;
}

.ik-table {
  width: 100%;
  border-collapse: collapse;
}

.ik-table th {
  padding: 14px 16px;
  text-align: left;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-text-secondary);
  background: var(--ik-surface);
  border-bottom: 1px solid var(--ik-border);
}

.ik-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--ik-border-light);
  vertical-align: middle;
}

.ik-table tbody tr {
  transition: var(--ik-transition);
}

.ik-table tbody tr:hover {
  background: var(--ik-surface);
}

.ik-text-right { text-align: right; }
.ik-text-center { text-align: center; }

.ik-code {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ik-primary);
  background: var(--ik-primary-light);
  padding: 4px 8px;
  border-radius: 4px;
}

.ik-item-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ik-item-name {
  font-weight: 500;
  color: var(--ik-text);
}

.ik-item-note {
  font-size: 0.7rem;
  color: var(--ik-text-secondary);
  background: var(--ik-surface);
  padding: 2px 8px;
  border-radius: 4px;
  width: fit-content;
}

.ik-unit {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ik-text-secondary);
  background: var(--ik-surface);
  padding: 4px 10px;
  border-radius: 4px;
}

.ik-table-input {
  width: 80px;
  padding: 8px 10px;
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  text-align: right;
  transition: var(--ik-transition);
}

.ik-table-input:hover {
  border-color: var(--ik-secondary);
}

.ik-table-input:focus {
  outline: none;
  border-color: var(--ik-primary);
  box-shadow: 0 0 0 2px rgba(71, 85, 105, 0.1);
}

.ik-cost {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: var(--ik-primary);
}

.ik-cost-warn {
  color: var(--ik-danger);
}

.ik-table-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  transition: var(--ik-transition);
  margin: 0 2px;
}

.ik-table-btn:hover {
  border-color: var(--ik-primary);
  color: var(--ik-primary);
  background: var(--ik-primary-light);
}

.ik-table-btn.ik-danger:hover {
  border-color: var(--ik-danger);
  color: var(--ik-danger);
  background: var(--ik-danger-light);
}

/* ===== Group Row ===== */
.ik-group-row {
  background: var(--ik-primary-light);
}

.ik-group-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ik-group-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ik-group-icon {
  font-size: 1rem;
}

.ik-group-name {
  font-weight: 700;
  color: var(--ik-text);
}

.ik-group-badge {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-primary);
  background: var(--ik-bg-card);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--ik-border);
}

.ik-group-actions {
  display: flex;
  gap: 4px;
}

.ik-flash {
  animation: ik-flash 0.5s ease;
}

@keyframes ik-flash {
  0%, 100% { background: transparent; }
  50% { background: rgba(71, 85, 105, 0.15); }
}

.ik-group-row.ik-flash {
  animation: ik-group-flash 0.5s ease;
}

@keyframes ik-group-flash {
  0%, 100% { background: var(--ik-primary-light); }
  50% { background: rgba(71, 85, 105, 0.25); }
}

/* ===== Count Badge ===== */
.ik-count-badge {
  padding: 4px 12px;
  background: var(--ik-primary);
  border-radius: var(--ik-radius);
  font-size: 0.7rem;
  font-weight: 700;
  color: #FFFFFF;
}

/* ===== Empty State ===== */
.ik-empty {
  text-align: center;
  padding: 60px 24px;
  background: var(--ik-surface);
}

.ik-empty-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.ik-empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ik-text-secondary);
  margin-bottom: 4px;
}

.ik-empty-text {
  font-size: 0.875rem;
  color: var(--ik-text-muted);
}

/* ===== Step Input ===== */
.ik-step-input {
  display: flex;
  gap: 12px;
  padding: 24px;
  border-bottom: 1px solid var(--ik-border);
  background: var(--ik-bg-card);
}

.ik-step-input .ik-field {
  flex: 1;
  margin: 0;
}

/* ===== Steps Grid ===== */
.ik-steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 24px;
  background: var(--ik-surface);
}

.ik-step-card {
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius-lg);
  overflow: hidden;
  transition: var(--ik-transition);
}

.ik-step-card:hover {
  box-shadow: var(--ik-shadow-md);
  border-color: var(--ik-secondary);
}

.ik-step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--ik-border);
  background: var(--ik-surface);
}

.ik-step-number {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ik-primary);
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.875rem;
  color: #FFFFFF;
}

.ik-step-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-text-muted);
  flex: 1;
}

.ik-step-remove {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--ik-border);
  border-radius: 50%;
  color: var(--ik-text-muted);
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-step-remove:hover {
  background: var(--ik-danger);
  border-color: var(--ik-danger);
  color: #FFFFFF;
}

.ik-step-textarea {
  width: 100%;
  min-height: 100px;
  padding: 16px;
  background: var(--ik-bg-card);
  border: none;
  color: var(--ik-text);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.5;
  resize: vertical;
}

.ik-step-textarea:focus {
  outline: none;
}

.ik-step-photo {
  padding: 16px;
  border-top: 1px solid var(--ik-border);
  background: var(--ik-surface);
}

.ik-step-photo-preview {
  aspect-ratio: 1;
  border-radius: var(--ik-radius);
  overflow: hidden;
  border: 1px solid var(--ik-border);
}

.ik-step-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ik-step-photo-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  aspect-ratio: 1;
  background: var(--ik-bg-card);
  border: 2px dashed var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-step-photo-upload:hover {
  border-color: var(--ik-primary);
  color: var(--ik-primary);
}

.ik-step-photo-upload span {
  font-size: 0.75rem;
}

/* ===== Legacy Method ===== */
.ik-legacy-method {
  padding: 0 24px 24px;
  margin-top: 24px;
  border-top: 1px solid var(--ik-border);
  padding-top: 24px;
  background: var(--ik-bg-card);
}

/* ===== Nutrition Grid ===== */
.ik-nutrition-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  padding: 24px;
}

.ik-nutrition-grid .ik-field {
  margin: 0;
}

/* ===== History Actions ===== */
.ik-history-actions {
  display: flex;
  gap: 8px;
}

/* ===== Responsive ===== */
@media (max-width: 1024px) {
  .ik-sidebar {
    width: 200px;
  }
  
  .ik-kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .ik-steps-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .ik-nutrition-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .ik-app {
    flex-direction: column;
  }
  
  .ik-sidebar {
    width: 100%;
    height: auto;
    position: relative;
  }
  
  .ik-nav {
    display: flex;
    overflow-x: auto;
    padding: 8px;
    gap: 4px;
  }
  
  .ik-nav-item {
    flex-shrink: 0;
    padding: 10px 14px;
  }
  
  .ik-main {
    padding: 16px;
  }
  
  .ik-form-grid,
  .ik-nutrition-grid {
    grid-template-columns: 1fr;
  }
  
  .ik-span-2 {
    grid-column: span 1;
  }
  
  .ik-steps-grid {
    grid-template-columns: 1fr;
  }
  
  .ik-kpi-grid {
    grid-template-columns: 1fr;
  }
  
  .ik-add-row {
    flex-direction: column;
  }
}
`

// ... (باقي الكود كما هو - المكون الرئيسي والـ callbacks وكل شيء يبقى نفسه)
