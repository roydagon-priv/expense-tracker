# Deployment Guide — GitHub Pages + Google Apps Script

## Overview

Two things to deploy:
1. **Backend** — `Code.gs` → Google Apps Script (runs the data layer)
2. **Frontend** — `index.html`, `manifest.json`, `sw.js` → GitHub Pages (the app itself)

---

## Step 1 — Set Up Google Apps Script

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Create a tab named **`Budgets`** (this is required — the app reads budget data from it)
3. Open **Extensions → Apps Script**
4. Delete any existing code in `Code.gs`, paste the contents of this project's `Code.gs`
5. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** — authorize if prompted
7. **Copy the web app URL** — you'll need it in Step 4

> The URL looks like: `https://script.google.com/macros/s/AKfycb.../exec`

---

## Step 2 — Push to GitHub

1. Create a new repository at [github.com/new](https://github.com/new)
   - Name: e.g. `expense-tracker`
   - Visibility: **Private** is fine (GitHub Pages works on private repos with a free account on public repos only — use **Public** for free hosting)
2. Push the three frontend files to the repo root:
   ```
   index.html
   manifest.json
   sw.js
   ```

   ```bash
   git init
   git add index.html manifest.json sw.js
   git commit -m "Initial deploy"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/expense-tracker.git
   git push -u origin main
   ```

---

## Step 3 — Enable GitHub Pages

1. Go to your repo on GitHub
2. **Settings → Pages** (left sidebar)
3. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
4. Click **Save**
5. Wait ~60 seconds — your app will be live at:
   ```
   https://YOUR_USERNAME.github.io/expense-tracker/
   ```

> GitHub will show the URL at the top of the Pages settings page once it's ready.

---

## Step 4 — Connect Frontend to Backend

1. Open the app URL on your phone or browser
2. You'll see the **first-run setup screen** asking for the Apps Script URL
3. Paste the URL you copied in Step 1
4. Tap **Get Started** — the URL is saved to `localStorage`

> You only do this once per device/browser.

---

## Step 5 — Install as PWA (optional but recommended)

**On iPhone (Safari):**
1. Open the app URL in Safari
2. Tap the **Share** button → **Add to Home Screen**
3. Tap **Add**

**On Android (Chrome):**
1. Open the app URL in Chrome
2. Tap the **⋮ menu → Add to Home Screen** (or Chrome may prompt you automatically)

---

## Updating the App

Whenever you change `index.html`, `manifest.json`, or `sw.js`:

```bash
git add index.html manifest.json sw.js
git commit -m "your change description"
git push
```

GitHub Pages redeploys automatically within ~30 seconds.

> **Note on service worker caching:** After a deploy, users may need to refresh twice or clear the service worker cache for changes to take effect. This is normal PWA behavior.

---

## Updating the Backend

If you change `Code.gs`:
1. Open Apps Script editor
2. Click **Deploy → Manage deployments**
3. Click the pencil icon on your existing deployment
4. Change version to **"New version"**
5. Click **Deploy**

> The URL stays the same — no need to update the frontend.

---

## Custom Domain (optional)

1. Go to **repo Settings → Pages → Custom domain**
2. Enter your domain (e.g. `expenses.yourdomain.com`)
3. Add a `CNAME` DNS record pointing to `YOUR_USERNAME.github.io`
4. Check **Enforce HTTPS** once DNS propagates (~24h)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App shows first-run screen every time | Check that `localStorage` is not being cleared (private browsing mode?) |
| API calls fail | Re-deploy Apps Script as a new version; check "Anyone" access |
| PWA not installable | Make sure you're on HTTPS (GitHub Pages is HTTPS by default) |
| Service worker not updating | Open DevTools → Application → Service Workers → click "Update" |
| Blank page after deploy | Wait 60s and hard-refresh; GitHub Pages takes a moment on first deploy |
