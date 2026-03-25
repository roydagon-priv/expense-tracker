// ============================================================
// Mobile Expense Tracker — Google Apps Script Backend
// ============================================================

const CATEGORIES = ['Groceries', 'Eating Out', 'Transport', 'Shopping', 'Health', 'Entertainment', 'Bills', 'Other'];

const COL = {
  ID: 1,
  DATE: 2,
  AMOUNT: 3,
  CATEGORY: 4,
  NOTE: 5,
  IS_RECURRING: 6,
  IS_FAVORITE: 7,
  FAVORITE_NAME: 8,
  INSTALLMENTS: 9,
};

const BUDGET_COL = {
  CATEGORY: 1,
  MONTHLY_LIMIT: 2,
};

const HEADERS = ['ID', 'Date', 'Amount (ILS)', 'Category', 'Note', 'IsRecurring', 'IsFavorite', 'FavoriteName', 'Installments'];
const BUDGET_HEADERS = ['Category', 'MonthlyLimit'];

// ─── Helpers ────────────────────────────────────────────────

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === 'Budgets') {
      sheet.appendRow(BUDGET_HEADERS);
      sheet.getRange(1, 1, 1, BUDGET_HEADERS.length).setFontWeight('bold');
    } else {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
  }
  return sheet;
}

function generateId() {
  return Utilities.getUuid().split('-')[0].toUpperCase();
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function rowToExpense(row) {
  return {
    id: row[COL.ID - 1],
    date: row[COL.DATE - 1] instanceof Date
      ? Utilities.formatDate(row[COL.DATE - 1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : row[COL.DATE - 1],
    amount: row[COL.AMOUNT - 1],
    category: row[COL.CATEGORY - 1],
    note: row[COL.NOTE - 1],
    isRecurring: row[COL.IS_RECURRING - 1] === true || row[COL.IS_RECURRING - 1] === 'TRUE',
    isFavorite: row[COL.IS_FAVORITE - 1] === true || row[COL.IS_FAVORITE - 1] === 'TRUE',
    favoriteName: row[COL.FAVORITE_NAME - 1],
    installments: row[COL.INSTALLMENTS - 1],
  };
}

function jsonResponse(data, status) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function corsHeaders() {
  // Apps Script doesn't allow setting response headers directly on doGet/doPost,
  // but the JSON content type is set via setMimeType. CORS for web app deployments
  // is handled by deploying as "Anyone" access. Kept here for documentation.
}

// ─── Action Handlers ────────────────────────────────────────

function addExpense(params) {
  const { date, amount, category, note, isRecurring, isFavorite, favoriteName, installments, month } = params;

  if (!date || amount === undefined || !category) {
    return { error: 'Missing required fields: date, amount, category' };
  }

  const monthKey = month || date.substring(0, 7); // YYYY-MM
  const sheet = getOrCreateSheet(monthKey);
  const id = generateId();

  sheet.appendRow([
    id,
    date,
    Number(amount),
    category,
    note || '',
    isRecurring === true || isRecurring === 'true',
    isFavorite === true || isFavorite === 'true',
    favoriteName || '',
    installments || '',
  ]);

  return { success: true, id, month: monthKey };
}

function getExpenses(params) {
  const { month } = params;
  if (!month) return { error: 'Missing required param: month (YYYY-MM)' };

  const sheet = getOrCreateSheet(month);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { expenses: [], month };

  // Exclude favorite template rows (created by addFavorite, not real expenses)
  const expenses = data.slice(1)
    .map(rowToExpense)
    .filter(e => !(e.isFavorite && !e.isRecurring));
  return { expenses, month };
}

function getSummary(params) {
  const { month } = params;
  if (!month) return { error: 'Missing required param: month (YYYY-MM)' };

  const sheet = getOrCreateSheet(month);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { summary: {}, total: 0, month };

  const summary = {};
  CATEGORIES.forEach(c => { summary[c] = 0; });

  data.slice(1).forEach(row => {
    const isFavorite = row[COL.IS_FAVORITE - 1] === true || row[COL.IS_FAVORITE - 1] === 'TRUE';
    const isRecurring = row[COL.IS_RECURRING - 1] === true || row[COL.IS_RECURRING - 1] === 'TRUE';
    // Skip favorite template rows (not real expenses)
    if (isFavorite && !isRecurring) return;
    const category = row[COL.CATEGORY - 1];
    const amount = Number(row[COL.AMOUNT - 1]) || 0;
    if (summary[category] !== undefined) {
      summary[category] += amount;
    } else {
      summary['Other'] = (summary['Other'] || 0) + amount;
    }
  });

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  return { summary, total, month };
}

function getFavorites() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const favorites = [];

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name === 'Budgets') return;

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    data.slice(1).forEach(row => {
      if (row[COL.IS_FAVORITE - 1] === true || row[COL.IS_FAVORITE - 1] === 'TRUE') {
        favorites.push(rowToExpense(row));
      }
    });
  });

  // Deduplicate by favoriteName (keep latest)
  const seen = new Map();
  favorites.forEach(f => {
    const key = f.favoriteName || f.id;
    seen.set(key, f);
  });

  return { favorites: Array.from(seen.values()) };
}

function addFavorite(params) {
  const { amount, category, note, favoriteName, installments } = params;

  if (!favoriteName || !category || amount === undefined) {
    return { error: 'Missing required fields: amount, category, favoriteName' };
  }

  // Store favorites in the current month's sheet as a template row
  const now = new Date();
  const monthKey = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  const today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const sheet = getOrCreateSheet(monthKey);
  const id = generateId();

  sheet.appendRow([
    id,
    today,
    Number(amount),
    category,
    note || '',
    false,
    true,
    favoriteName,
    installments || '',
  ]);

  return { success: true, id, favoriteName };
}

function getRecurring() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const recurring = [];

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name === 'Budgets') return;

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    data.slice(1).forEach(row => {
      if (row[COL.IS_RECURRING - 1] === true || row[COL.IS_RECURRING - 1] === 'TRUE') {
        recurring.push(rowToExpense(row));
      }
    });
  });

  // Deduplicate: keep one template per unique note+category+amount combo
  const seen = new Map();
  recurring.forEach(r => {
    const key = `${r.category}|${r.amount}|${r.note}`;
    if (!seen.has(key)) seen.set(key, r);
  });

  return { recurring: Array.from(seen.values()) };
}

function applyRecurring(params) {
  const now = new Date();
  const monthKey = params.month || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  const today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const { recurring } = getRecurring();
  const targetSheet = getOrCreateSheet(monthKey);

  // Gather existing notes in the target month to avoid duplicates
  const existing = targetSheet.getDataRange().getValues().slice(1);
  const existingKeys = new Set(
    existing.map(row => `${row[COL.CATEGORY - 1]}|${row[COL.AMOUNT - 1]}|${row[COL.NOTE - 1]}`)
  );

  let added = 0;
  recurring.forEach(r => {
    const key = `${r.category}|${r.amount}|${r.note}`;
    if (!existingKeys.has(key)) {
      targetSheet.appendRow([
        generateId(),
        today,
        r.amount,
        r.category,
        r.note || '',
        true,
        r.isFavorite,
        r.favoriteName || '',
        r.installments || '',
      ]);
      added++;
    }
  });

  return { success: true, added, month: monthKey };
}

function deleteExpense(params) {
  const { id } = params;
  if (!id) return { error: 'Missing required param: id' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  for (const sheet of sheets) {
    if (sheet.getName() === 'Budgets') continue;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.ID - 1]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { success: true, id };
      }
    }
  }

  return { error: `Expense not found: ${id}` };
}

function editExpense(params) {
  const { id, date, amount, category, note, isRecurring, month } = params;
  if (!id) return { error: 'Missing required param: id' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  for (const sheet of sheets) {
    if (sheet.getName() === 'Budgets') continue;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.ID - 1]) === String(id)) {
        const row = i + 1;
        sheet.getRange(row, COL.DATE).setValue(date);
        sheet.getRange(row, COL.AMOUNT).setValue(Number(amount));
        sheet.getRange(row, COL.CATEGORY).setValue(category);
        sheet.getRange(row, COL.NOTE).setValue(note || '');
        sheet.getRange(row, COL.IS_RECURRING).setValue(isRecurring === true || isRecurring === 'true');
        return { success: true, id };
      }
    }
  }

  return { error: `Expense not found: ${id}` };
}

function getBudgets() {
  const sheet = getOrCreateSheet('Budgets');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { budgets: [] };

  const budgets = [];
  data.slice(1).forEach(row => {
    const category = row[BUDGET_COL.CATEGORY - 1];
    const limit = row[BUDGET_COL.MONTHLY_LIMIT - 1];
    if (category) budgets.push({ category, monthlyLimit: Number(limit) || 0 });
  });

  return { budgets };
}

function setBudget(params) {
  const { category, monthlyLimit } = params;
  if (!category || monthlyLimit === undefined) {
    return { error: 'Missing required fields: category, monthlyLimit' };
  }

  const sheet = getOrCreateSheet('Budgets');
  const data = sheet.getDataRange().getValues();

  // Find existing row for this category
  for (let i = 1; i < data.length; i++) {
    if (data[i][BUDGET_COL.CATEGORY - 1] === category) {
      sheet.getRange(i + 1, BUDGET_COL.MONTHLY_LIMIT).setValue(Number(monthlyLimit));
      return { success: true, category, monthlyLimit: Number(monthlyLimit) };
    }
  }

  // Not found — append
  sheet.appendRow([category, Number(monthlyLimit)]);
  return { success: true, category, monthlyLimit: Number(monthlyLimit) };
}

function setBudgets(params) {
  // Atomically rewrite all budgets, eliminating duplicates.
  const { budgets } = params;
  if (!Array.isArray(budgets)) {
    return { error: 'Missing required field: budgets (array)' };
  }

  const sheet = getOrCreateSheet('Budgets');

  // Clear all data rows, keep header
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  // Write all entries in one batch
  const entries = budgets.filter(b => b.category && Number(b.monthlyLimit) > 0);
  if (entries.length > 0) {
    const rows = entries.map(b => [b.category, Number(b.monthlyLimit)]);
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }

  return { success: true, count: entries.length };
}

// ─── Entry Points ────────────────────────────────────────────

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, ...params } = body;

    let result;
    switch (action) {
      case 'add_expense':    result = addExpense(params);   break;
      case 'get_expenses':   result = getExpenses(params);  break;
      case 'get_summary':    result = getSummary(params);   break;
      case 'get_favorites':  result = getFavorites();       break;
      case 'add_favorite':   result = addFavorite(params);  break;
      case 'get_recurring':  result = getRecurring();       break;
      case 'apply_recurring':result = applyRecurring(params); break;
      case 'get_budgets':    result = getBudgets();         break;
      case 'set_budget':     result = setBudget(params);    break;
      case 'set_budgets':    result = setBudgets(params);   break;
      case 'edit_expense':   result = editExpense(params);  break;
      case 'delete_expense': result = deleteExpense(params); break;
      default:
        result = { error: `Unknown action: ${action}` };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const action = e.parameter.action || 'ping';
  const params = Object.assign({}, e.parameter);
  delete params.action;

  let result;
  switch (action) {
    case 'get_expenses':   result = getExpenses(params);  break;
    case 'get_summary':    result = getSummary(params);   break;
    case 'get_favorites':  result = getFavorites();       break;
    case 'get_recurring':  result = getRecurring();       break;
    case 'get_budgets':    result = getBudgets();         break;
    case 'ping':
      result = { ok: true, categories: CATEGORIES, timestamp: new Date().toISOString() };
      break;
    default:
      result = { error: `Unknown action: ${action}` };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
