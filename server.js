const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto  = require('crypto');
const app     = express();
const PORT    = 3000;

const SECRET_KEY = process.env.SECRET_KEY;
const MAX_ATTEMPTS  = 2;       // попыток до блокировки
const LOCKOUT_MS    = 30 * 60 * 1000; // 30 минут в мс

// Хранилище попыток: { ip -> { attempts, lockedUntil } }
const loginAttempts = {};

function getEntry(ip) {
    if (!loginAttempts[ip]) loginAttempts[ip] = { attempts: 0, lockedUntil: null };
    return loginAttempts[ip];
}

function checkAuth(req, res, next) {
    const ip  = req.ip || req.connection.remoteAddress;
    const key = req.headers['x-access-key'] || '';
    const entry = getEntry(ip);

    // Заблокирован?
    if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
        const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({
            error: 'Too many attempts',
            message: `Слишком много попыток. Попробуйте через ${remaining} мин.`,
            lockedUntil: entry.lockedUntil
        });
    }

    // Сброс блокировки если время вышло
    if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
        entry.attempts   = 0;
        entry.lockedUntil = null;
    }

    // Сравнение ключей через timingSafeEqual (защита от timing-атак)
    // Padding до одинаковой длины чтобы timingSafeEqual не крашился
    const expected = Buffer.from(SECRET_KEY);
    const provided = Buffer.alloc(expected.length, 0);
    Buffer.from(key).copy(provided);
    const valid = key.length === SECRET_KEY.length &&
                  crypto.timingSafeEqual(expected, provided);

    if (valid) {
        entry.attempts  = 0;   // сброс при успехе
        entry.lockedUntil = null;
        return next();
    }

    // Неверный ключ
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

const db = new sqlite3.Database('./database.db');
db.run(`
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
    db.all('SELECT * FROM reports ORDER BY date DESC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/reports', checkAuth, (req, res) => {
    const { container, amount, company, cz, date } = req.body;
    if (!container || !amount || !company || !date)
        return res.status(400).json({ error: 'Missing fields' });

    const created_at = new Date().toISOString();
    const czValue    = (cz && cz > 0) ? cz : null;

    db.run(
        'INSERT INTO reports (container, amount, company, cz, date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [container, amount, company, czValue, date, created_at],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true });
        }
    );
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));