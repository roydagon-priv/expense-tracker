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
- **Default USD rate is 3.10** (₪ per $1), stored in localStorage under `USD_RATE`.

## API Contract

The Apps Script web app receives POST requests with a JSON body containing an `action` field.

| Action | Description |
|---|---|
| `add_expense` | Add a row to the current month tab |
| `get_expenses` | Return all non-favorite-template rows for `month` (YYYY-MM) |
| `get_summary` | Return ILS totals per category for `month`, excluding favorite templates |
| `get_favorites` | Return rows where IsFavorite = true |
| `add_favorite` | Save a favorite template row (isFavorite=true, isRecurring=false) |
| `get_recurring` | Return rows where IsRecurring = true |
| `apply_recurring` | Copy recurring rows into current month if not already present |
| `get_budgets` | Return array of `{ category, monthlyLimit }` from Budgets tab |
| `set_budget` | Upsert a single `{ category, monthlyLimit }` row in Budgets tab |
| `set_budgets` | Atomically rewrite all budgets — clears sheet and rewrites from `{ budgets: [{category, monthlyLimit}] }` |
| `delete_expense` | Delete a row by `id` (searches all month sheets) |
| `edit_expense` | Update an existing row by `id` (date, amount, category, note, isRecurring) |

All responses return JSON. All responses include CORS headers.

### Important API notes
- `get_budgets` returns `{ budgets: [{ category, monthlyLimit }] }` — an **array**, not an object map.
- `set_budget` requires `{ category, monthlyLimit }` — the key is `monthlyLimit`, not `limit`.
- **Always use `set_budgets` (bulk) instead of multiple parallel `set_budget` calls.** Parallel calls cause race conditions and duplicate rows in the sheet. `set_budgets` clears and rewrites atomically.
- `get_expenses` and `get_summary` **exclude** rows where `isFavorite=true && isRecurring=false` (these are favorite templates, not real expenses).
- Favorite templates are stored as rows in the month sheet with `isFavorite=true, isRecurring=false`. They are retrieved via `get_favorites` and excluded from expense/summary queries.

### Sheet Schema
**Month tabs (e.g. `2026-03`)**
`ID | Date | Amount (ILS) | Category | Note | IsRecurring | IsFavorite | FavoriteName | Installments`

**Budgets tab**
`Category | MonthlyLimit`

## Categories
```
Groceries, Eating Out, Transport, Shopping, Health, Entertainment, Bills, Other
```
Each category should have a consistent emoji and color assigned. Do not change these without being asked.

Note: "Eating Out" contains a space. When used as an HTML element ID suffix, sanitize it: `cat.id.replace(/\s+/g, '-')` → `Eating-Out`.

## Frontend Structure
The UI has a **bottom navigation bar** with 4 tabs:
1. **Add** — expense form + favorites row
2. **History** — expenses grouped by day, swipe-to-delete (always shows current month)
3. **Dashboard** — monthly summary, budget bars, insights, alerts, month selector
4. **Settings** — budgets, favorites, USD rate, export, apply recurring

### Dashboard Tab — Sections (top to bottom)
1. **Month selector** — prev/next arrows + label. Next arrow is disabled for the current month (cannot navigate to future months).
2. **Monthly Summary card** — three rows:
   - Net Income (editable number input, saved per month in localStorage as `INCOME_YYYY-MM`)
   - Spent (total for month + USD equivalent)
   - Remaining (Income − Spent, green/red, with a progress bar). Hidden when no income is set.
3. **By Category** — progress bars per category, spent vs budget.
4. **Insights** — analytical metrics: donut pie chart (spending by category), daily average, biggest single expense (excl. Bills), busiest day (excl. Bills), spending pace/projection (current month only).
5. **Alerts** — month-over-month change warnings (>20% up/down, excl. Bills), over-budget alerts, and budget pace warnings (projected to exceed by end of month).
6. **Export buttons** — CSV and Print.

### Key UI Rules
- Large tap targets everywhere (min 44px height)
- Dark theme, calm palette — not generic purple gradients
- Toast notifications for all user actions (2s auto-dismiss, bottom of screen)
- Loading spinner on every API call
- Graceful error handling — never show a raw error to the user
- First-run screen if `API_URL` is still the placeholder string
- Confirm dialog before any delete action

## localStorage Keys
```
API_URL            # The deployed Apps Script web app URL
USD_RATE           # Exchange rate for ILS → USD (default: 3.10)
SELECTED_MONTH     # Currently viewed month on Dashboard (YYYY-MM)
INCOME_YYYY-MM     # Net income for a given month (one key per month, e.g. INCOME_2026-03)
```

## Caching Layer

All API responses are cached in `_cache` (keyed by `action:month`). A `_dirty` set tracks stale keys. Helper functions:

- `cachedApi(action, payload)` — returns cached data if clean; fetches and caches otherwise.
- `invalidateExpenseCache(month)` — marks expense/summary data for a month (and its neighbors) as stale.
- `invalidateBudgetCache()` — marks budget data as stale.
- `invalidateCache(...keys)` — generic invalidation.

**Pattern for tab loading:** render immediately from cache if available, then re-fetch in background if any key is dirty or missing. This avoids blank screens on tab switch.

Mutations (add, edit, delete expense; save favorites/recurring; save budgets) must call the appropriate invalidation function so the next tab open re-fetches fresh data.

## Code Style
- Use `async/await` for all API calls, never raw `.then()` chains
- All fetch calls wrapped in try/catch with user-facing error toasts
- Constants at the top of each file (API_URL, CATEGORIES, colors)
- Comments on any non-obvious logic
- No inline styles — use CSS classes and variables
- Use local system time for dates — never `new Date().toISOString()` (UTC). Use the `todayYMD()` and `todayYM()` helpers which use local time.
- Category IDs with spaces must be sanitized with `.replace(/\s+/g, '-')` when used in HTML element IDs

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
Groceries     #4ade80  🛒   --cat-groceries
Eating Out    #fb923c  🍔   --cat-eating-out
Transport     #60a5fa  🚌   --cat-transport
Shopping      #e879f9  🛍   --cat-shopping
Health        #34d399  💊   --cat-health
Entertainment #fbbf24  🎬   --cat-entertainment
Bills         #f87171  💡   --cat-bills
Other         #94a3b8  📦   --cat-other
```

## Fonts
- Body: `DM Sans` (Google Fonts) — weights 300, 400, 500, 600
- Monospace (amounts, codes): `DM Mono` — weights 300, 400, 500

## Export Behavior
- **CSV**: always fetches fresh data for `selectedMonth` from the API. Downloads as `expenses-YYYY-MM.csv`. Columns: Date, Category, Amount (ILS), Amount (USD), Note.
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
- Do not use `new Date().toISOString()` for local dates — use `todayYMD()` / `todayYM()` helpers
- Do not allow navigation to future months in the dashboard
