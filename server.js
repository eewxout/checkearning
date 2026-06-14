const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

const SECRET_KEY = process.env.SECRET_KEY;
const MAX_ATTEMPTS = 2;
const LOCKOUT_MS = 30 * 60 * 1000;

const loginAttempts = {};

function getEntry(ip) {
    if (!loginAttempts[ip]) loginAttempts[ip] = { attempts: 0, lockedUntil: null };
    return loginAttempts[ip];
}

function checkAuth(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const key = req.headers['x-access-key'] || '';
    const entry = getEntry(ip);

    if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
        const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({
            error: 'Too many attempts',
            message: `Слишком много попыток. Попробуйте через ${remaining} мин.`,
            lockedUntil: entry.lockedUntil
        });
    }

    if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
        entry.attempts = 0;
        entry.lockedUntil = null;
    }

    const expected = Buffer.from(SECRET_KEY);
    const provided = Buffer.alloc(expected.length, 0);
    Buffer.from(key).copy(provided);
    const valid = key.length === SECRET_KEY.length &&
                  crypto.timingSafeEqual(expected, provided);

    if (valid) {
        entry.attempts = 0;
        entry.lockedUntil = null;
        return next();
    }

    entry.attempts += 1;

    if (entry.attempts >= MAX_ATTEMPTS) {
        entry.lockedUntil = Date.now() + LOCKOUT_MS;
        return res.status(429).json({
            error: 'Too many attempts',
            message: 'Слишком много попыток. Попробуйте через 30 мин.',
            lockedUntil: entry.lockedUntil
        });
    }

    const left = MAX_ATTEMPTS - entry.attempts;
    return res.status(401).json({
        error: 'Unauthorized',
        message: `Неверный ключ. Осталось попыток: ${left}`,
        attemptsLeft: left
    });
}

app.use(express.json());
app.use(express.static('public'));

const db = new Database('./database.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container TEXT NOT NULL,
    amount REAL NOT NULL,
    company TEXT NOT NULL,
    cz REAL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

app.get('/api/reports', checkAuth, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM reports ORDER BY date DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reports', checkAuth, (req, res) => {
    const { container, amount, company, cz, date } = req.body;
    if (!container || !amount || !company || !date) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const created_at = new Date().toISOString();
    const czValue = (cz && cz > 0) ? cz : null;

    try {
        const stmt = db.prepare(`
            INSERT INTO reports (container, amount, company, cz, date, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(container, amount, company, czValue, date, created_at);
        res.json({ id: info.lastInsertRowid, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));