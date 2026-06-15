const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

const SECRET_KEY = process.env.SECRET_KEY;
const MAX_ATTEMPTS = 2;
const LOCKOUT_MS = 30 * 60 * 1000;

// Хранилище блокировок по КЛЮЧУ (не по IP)
const keyAttempts = {};

function checkAuth(req, res, next) {
    const key = req.headers['x-access-key'] || '';
    
    // Блокировка по ключу
    const entry = keyAttempts[key] || { attempts: 0, lockedUntil: null };
    
    if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
        const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({
            error: 'Too many attempts',
            message: `Ключ заблокирован. Попробуйте через ${remaining} мин.`
        });
    }
    
    if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
        delete keyAttempts[key];
    }
    
    // Проверка ключа
    if (key === SECRET_KEY) {
        delete keyAttempts[key];
        return next();
    }
    
    // Неверный ключ
    if (!keyAttempts[key]) {
        keyAttempts[key] = { attempts: 1, lockedUntil: null };
    } else {
        keyAttempts[key].attempts += 1;
    }
    
    if (keyAttempts[key].attempts >= MAX_ATTEMPTS) {
        keyAttempts[key].lockedUntil = Date.now() + LOCKOUT_MS;
        return res.status(429).json({
            error: 'Too many attempts',
            message: 'Ключ заблокирован на 30 минут. Слишком много попыток.'
        });
    }
    
    const left = MAX_ATTEMPTS - keyAttempts[key].attempts;
    return res.status(401).json({
        error: 'Unauthorized',
        message: `Неверный ключ. Осталось попыток: ${left}`
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
// ===== АВТОСОХРАНЕНИЕ БД =====
function backupDatabase() {
    try {
        const reports = db.prepare('SELECT * FROM reports').all();
        if (reports.length > 0) {
            let sql = `-- Backup ${new Date().toISOString()}\n`;
            for (const r of reports) {
                sql += `INSERT INTO reports (id, container, amount, company, cz, date, created_at) VALUES (${r.id}, '${r.container}', ${r.amount}, '${r.company}', ${r.cz || 'NULL'}, '${r.date}', '${r.created_at}');\n`;
            }
            fs.writeFileSync('./database_dump.sql', sql);
            console.log('✅ Бэкап сохранён');
        }
    } catch(err) { console.log('Бэкап:', err.message); }
}

// Восстановление при запуске
try {
    if (fs.existsSync('./database_dump.sql')) {
        const sql = fs.readFileSync('./database_dump.sql', 'utf8');
        const commands = sql.split(';').filter(c => c.trim() && !c.includes('Backup'));
        for (const cmd of commands) {
            try { db.exec(cmd); } catch(e) {}
        }
        console.log('✅ Данные восстановлены');
    }
} catch(err) { console.log('Восстановление:', err.message); }

// Автосохранение каждые 5 минут
setInterval(backupDatabase, 5 * 60 * 1000);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));