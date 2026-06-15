const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

const SECRET_KEY = process.env.SECRET_KEY;
const MAX_ATTEMPTS = 2;
const LOCKOUT_MS = 30 * 60 * 1000;

// Хранилище блокировок по ключу
const keyAttempts = {};

// Подключение к Turso
const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Проверка авторизации
function checkAuth(req, res, next) {
    const key = req.headers['x-access-key'] || '';
    
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
    
    if (key === SECRET_KEY) {
        delete keyAttempts[key];
        return next();
    }
    
    if (!keyAttempts[key]) {
        keyAttempts[key] = { attempts: 1, lockedUntil: null };
    } else {
        keyAttempts[key].attempts += 1;
    }
    
    if (keyAttempts[key].attempts >= MAX_ATTEMPTS) {
        keyAttempts[key].lockedUntil = Date.now() + LOCKOUT_MS;
        return res.status(429).json({
            error: 'Too many attempts',
            message: 'Ключ заблокирован на 30 минут.'
        });
    }
    
    const left = MAX_ATTEMPTS - keyAttempts[key].attempts;
    return res.status(401).json({
        error: 'Unauthorized',
        message: `Неверный ключ. Осталось попыток: ${left}`
    });
}

// Создание таблицы при запуске
async function initDatabase() {
    try {
        await db.execute(`
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
        console.log('✅ Turso подключен, таблица готова');
        
        const result = await db.execute('SELECT COUNT(*) as count FROM reports');
        console.log(`📊 В базе данных: ${result.rows[0].count} записей`);
    } catch (err) {
        console.error('❌ Ошибка Turso:', err.message);
        process.exit(1);
    }
}

// API endpoints
app.get('/api/reports', checkAuth, async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM reports ORDER BY date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reports', checkAuth, async (req, res) => {
    const { container, amount, company, cz, date } = req.body;
    
    if (!container || !amount || !company || !date) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const created_at = new Date().toISOString();
    const czValue = (cz && cz > 0) ? cz : null;

    try {
        const result = await db.execute({
            sql: `INSERT INTO reports (container, amount, company, cz, date, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [container, amount, company, czValue, date, created_at]
        });
        
        console.log(`✅ Добавлен отчёт: ${container}, ${amount}₽`);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (err) {
        console.error('Ошибка POST:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const result = await db.execute('SELECT COUNT(*) as count FROM reports');
        res.json({ 
            status: 'ok', 
            database: 'Turso',
            records: result.rows[0].count 
        });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
});

// Запуск
async function start() {
    await initDatabase();
    app.listen(PORT, () => {
        console.log(`🚀 Сервер на http://localhost:${PORT}`);
    });
}

start();