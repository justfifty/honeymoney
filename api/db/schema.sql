-- HoneyMoney Database Schema (SQLite)
-- Run: sqlite3 honeymoney.db < schema.sql

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    password    TEXT    NOT NULL,           -- bcrypt hash
    role        TEXT    NOT NULL DEFAULT 'owner', -- owner | member | admin
    household_id INTEGER REFERENCES households(id),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Households (Family / Team) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,           -- e.g. "The Rizal Family"
    type        TEXT    NOT NULL DEFAULT 'family', -- family | sme | corporate
    currency    TEXT    NOT NULL DEFAULT 'MYR',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Accounts (Bank / Wallet / Cash) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,          -- e.g. "Maybank Savings"
    type         TEXT    NOT NULL,          -- bank | ewallet | cash | investment
    balance      REAL    NOT NULL DEFAULT 0.0,
    currency     TEXT    NOT NULL DEFAULT 'MYR',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount       REAL    NOT NULL,          -- positive = income, negative = expense
    type         TEXT    NOT NULL,          -- income | expense | transfer
    category     TEXT    NOT NULL DEFAULT 'Uncategorised',
    description  TEXT,
    ai_category  TEXT,                      -- AI-suggested category
    date         TEXT    NOT NULL DEFAULT (date('now')),
    receipt_path TEXT,                      -- path to uploaded receipt image
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Budgets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category     TEXT    NOT NULL,
    monthly_limit REAL   NOT NULL,
    month        TEXT    NOT NULL,          -- YYYY-MM
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, category, month)
);

-- ─── Goals ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,          -- e.g. "Holiday in Japan"
    target_amount REAL   NOT NULL,
    saved_amount  REAL   NOT NULL DEFAULT 0.0,
    target_date  TEXT,
    emoji        TEXT    DEFAULT '🎯',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── AI Chat History ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT    NOT NULL,          -- user | assistant
    content      TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_user  ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date  ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
CREATE INDEX IF NOT EXISTS idx_goals_user         ON goals(user_id);
