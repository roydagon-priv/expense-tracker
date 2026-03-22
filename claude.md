# Expense Tracker — Claude Code Project Guide

## Project Overview
A mobile-first PWA expense tracker with a Google Apps Script backend and Google Sheets as the database. The app is designed for quick on-the-go expense logging from a phone browser, with a full dashboard for monthly analysis.

## Architecture
```
index.html          # Single-file PWA frontend (vanilla JS, no frameworks)
manifest.json       # PWA manifest for home screen installation
sw.js               # Service worker for offline support
Code.gs             # Google Apps Script backend (deployed as web app)
```

## Core Constraints — Read Before Every Task

- **No npm, no frameworks, no build steps.** The frontend is a single `index.html` using vanilla JS. Do not introduce React, Vue, bundlers, or package managers. The goal is zero build complexity.
- **No external JS libraries** unless absolutely necessary. Use native browser APIs. SVG charts must be hand-written, not Chart.js or similar.
- **Backend is Google Apps Script only.** All data logic lives in `Code.gs`. Do not suggest Firebase, Supabase, or any other backend.
- **Data store is Google Sheets.** One tab per month named `YYYY-MM`. A separate `Budgets` tab. Do not restructure this schema without being asked.
- **Currency is ILS (₪) as the primary.** USD is shown as a reference only, calculated client-side using a rate stored in localStorage. Never treat USD as a primary input.

## API Contract

The Apps Script web app receives POST requests with a JSON body containing an `action` field.

| Action | Description |
|---|---|
| `add_expense` | Add a row to the current month tab |
| `get_expenses` | Return all rows for `month` (YYYY-MM) |
| `get_summary` | Return ILS totals per category for `month` |
| `get_favorites` | Return rows where IsFavorite = true |
| `add_favorite` | Save a template row as a favorite |
| `get_recurring` | Return rows where IsRecurring = true |
| `apply_recurring` | Copy recurring rows into current month if not already present |
| `get_budgets` | Return all rows from Budgets tab |
| `set_budget` | Write a category + limit to Budgets tab |
| `delete_expense` | Delete a row by `id` from the current month tab |

All responses return JSON. All responses include CORS headers.

### Sheet Schema
**Month tabs (e.g. `2026-03`)**
`ID | Date | Amount (ILS) | Category | Note | IsRecurring | IsFavorite | FavoriteName | Installments`

**Budgets tab**
`Category | MonthlyLimit`

## Categories
```
Food, Transport, Shopping, Health, Entertainment, Bills, Other
```
Each category should have a consistent emoji and color assigned. Do not change these without being asked.

## Frontend Structure
The UI has a **bottom navigation bar** with 4 tabs:
1. **Add** — expense form + favorites row
2. **History** — expenses grouped by day, swipe-to-delete
3. **Dashboard** — monthly summary, budget bars, insights, month selector
4. **Settings** — budgets, favorites, USD rate, export, apply recurring

### Key UI Rules
- Large tap targets everywhere (min 44px height)
- Dark theme, calm palette — not generic purple gradients
- Toast notifications for all user actions (2s auto-dismiss, bottom of screen)
- Loading spinner on every API call
- Graceful error handling — never show a raw error to the user
- First-run screen if `API_URL` is still the placeholder string

## localStorage Keys
```
API_URL          # The deployed Apps Script web app URL
USD_RATE         # Exchange rate for ILS → USD (e.g. 3.7)
SELECTED_MONTH   # Currently viewed month on Dashboard (YYYY-MM)
```

## Code Style
- Use `async/await` for all API calls, never raw `.then()` chains
- All fetch calls wrapped in try/catch with user-facing error toasts
- Constants at the top of each file (API_URL, CATEGORIES, colors)
- Comments on any non-obvious logic
- No inline styles — use CSS classes and variables

## CSS Variables (enforce consistency)
```css
--bg-primary      /* main background (#0f1117) */
--bg-surface      /* card / panel background (#181c27) */
--bg-elevated     /* inputs, toggles, inner surfaces (#1e2335) */
--accent          /* primary action color (#4ade9a green) */
--accent-muted    /* accent at low opacity for selected states */
--accent-danger   /* over-budget, delete (#f87171) */
--accent-danger-muted  /* danger at low opacity */
--accent-warn     /* warning color (#fbbf24) */
--text-primary    /* #e8eaf0 */
--text-secondary  /* #6b7280 */
--text-dim        /* #3d4455 — section labels, nav inactive */
--border          /* #232840 */
--border-light    /* #2a3050 — toast, elevated borders */
--nav-height      /* 64px */
--radius          /* 14px — cards, sheets */
--radius-sm       /* 8px — inputs, small elements */
```

## Category Colors (do not change)
```
Food          #fb923c  🍔
Transport     #60a5fa  🚌
Shopping      #e879f9  🛍
Health        #34d399  💊
Entertainment #fbbf24  🎬
Bills         #f87171  💡
Other         #94a3b8  📦
```

## Fonts
- Body: `DM Sans` (Google Fonts) — weights 300, 400, 500, 600
- Monospace (amounts, codes): `DM Mono` — weights 300, 400, 500

## Export Behavior
- **CSV**: client-side generation, downloads as `expenses-YYYY-MM.csv`. Columns: Date, Category, Amount (ILS), Amount (USD), Note
- **PDF**: `window.print()` with a dedicated `@media print` stylesheet. Hides nav and form, shows summary table + full expense list.

## Deployment Checklist (for reference)
1. Create Google Sheet with a `Budgets` tab
2. Open Apps Script editor, paste `Code.gs`, deploy as web app (Execute as: Me, Access: Anyone)
3. Copy the web app URL → paste into the app's first-run screen (saved to localStorage)
4. Host frontend on GitHub Pages (or any static host)
5. Open on phone → Add to Home Screen for PWA install

## What NOT to Do
- Do not add authentication — this is a personal single-user tool
- Do not paginate the expense list — load the full month at once
- Do not add a backend framework (Express, Flask, etc.)
- Do not split index.html into multiple files unless explicitly asked
- Do not change the Google Sheets schema without confirming first
- Do not add win-probability or predictive features — this is a simple logger