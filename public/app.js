/* ══ Particles + nebula ══ */
(function () {
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    const nebula = document.getElementById('nebula');
    let W, H;

    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    resize(); window.addEventListener('resize', resize);

    document.addEventListener('mousemove', e => {
        nebula.style.left = e.clientX + 'px';
        nebula.style.top  = e.clientY + 'px';
    });

    class P {
        constructor() { this.reset(true); }
        reset(init) {
            this.x = Math.random() * W;
            this.y = init ? Math.random() * H : H + 8;
            this.r = Math.random() * 1.3 + 0.3;
            this.vy = Math.random() * 0.32 + 0.08;
            this.vx = (Math.random() - 0.5) * 0.22;
            this.ph = Math.random() * Math.PI * 2;
        }
        tick() {
            this.y -= this.vy; this.x += this.vx; this.ph += 0.017;
            if (this.y < -8) this.reset(false);
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150,130,255,${0.13 + Math.sin(this.ph) * 0.1})`;
            ctx.fill();
        }
    }
    const particles = Array.from({length: 85}, () => new P());

    (function loop() {
        ctx.clearRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W/2, H*.45, 0, W/2, H*.45, W*.65);
        g.addColorStop(0, 'rgba(35,18,90,0.22)'); g.addColorStop(1, 'rgba(13,13,43,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        particles.forEach(p => { p.tick(); p.draw(); });
        requestAnimationFrame(loop);
    })();
})();

/* ══ State ══ */
let currentKey = '';

/* ══ Login ══ */
let countdownTimer = null;

function login() {
    const key = document.getElementById('accessKey').value.trim();
    if (!key) { showError('Введите ключ доступа'); return; }

    // Проверяем локальную блокировку
    const lockedUntil = +localStorage.getItem('lockedUntil');
    if (lockedUntil && Date.now() < lockedUntil) {
        startCountdown(lockedUntil);
        return;
    }

    fetch('/api/reports', { headers: { 'x-access-key': key } })
        .then(r => r.json().then(data => ({ status: r.status, data })))
        .then(({ status, data }) => {
            if (status === 200) {
                currentKey = key;
                localStorage.setItem('accessKey', key);
                localStorage.removeItem('lockedUntil');
                clearInterval(countdownTimer);
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                loadAll();
            } else if (status === 429) {
                // Заблокированы
                localStorage.setItem('lockedUntil', data.lockedUntil);
                startCountdown(data.lockedUntil);
            } else {
                // 401 — неверный ключ, показываем сколько осталось попыток
                const msg = data.message || 'Неверный ключ доступа';
                showError(msg);
            }
        })
        .catch(() => showError('Ошибка соединения'));
}

function startCountdown(until) {
    clearInterval(countdownTimer);
    const btn = document.querySelector('.login-form button');
    if (btn) btn.disabled = true;

    function tick() {
        const left = Math.max(0, until - Date.now());
        if (left === 0) {
            clearInterval(countdownTimer);
            localStorage.removeItem('lockedUntil');
            showError('');
            if (btn) btn.disabled = false;
            return;
        }
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        showError(`Слишком много попыток. Подождите ${m}:${s.toString().padStart(2,'0')}`);
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
}

function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.innerText = msg;
    el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = msg ? '' : 'none'; });
}

function logout() {
    currentKey = '';
    localStorage.removeItem('accessKey');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('accessKey').value = '';
    document.getElementById('errorMsg').innerText = '';
    resetForm();
}

window.onload = function () {
    document.getElementById('accessKey').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

    // Восстанавливаем обратный отсчёт если страница перезагружена во время блокировки
    const lockedUntil = +localStorage.getItem('lockedUntil');
    if (lockedUntil && Date.now() < lockedUntil) {
        startCountdown(lockedUntil);
        return;
    }

    const k = localStorage.getItem('accessKey');
    if (k) { document.getElementById('accessKey').value = k; login(); }
};

/* ══ Company tabs ══ */
function selectCompany(btn, val) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('company').value = val;
}

/* ══ Form ══ */
(function initForm() {
    // wait for DOM
    document.addEventListener('DOMContentLoaded', () => {
        ['amount','cz'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updatePreview);
        });
    });
})();

function updatePreview() {
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const cz     = parseFloat(document.getElementById('cz').value)     || 0;
    const total  = amount + cz * 150;
    const el = document.getElementById('totalPreview');
    el.innerText = fmt(total);
    el.classList.remove('num-pop');
    void el.offsetWidth;
    el.classList.add('num-pop');
}

function resetForm() {
    ['container','amount','cz','date'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('company').value = 'РЕД-СТАР';
    document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i===0));
    const tp = document.getElementById('totalPreview'); if (tp) tp.innerText = '0';
    const msg = document.getElementById('createMsg');   if (msg) msg.innerText = '';
}

function createReport() {
    const container = document.getElementById('container').value.trim();
    const amount    = parseFloat(document.getElementById('amount').value);
    const company   = document.getElementById('company').value;
    const czRaw     = document.getElementById('cz').value;
    const date      = document.getElementById('date').value;
    const msgEl     = document.getElementById('createMsg');

    if (!container || isNaN(amount) || !date) { msgEl.innerText = '⚠ Заполните обязательные поля'; return; }
    const cz = czRaw !== '' ? parseFloat(czRaw) || null : null;

    fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-key': currentKey },
        body: JSON.stringify({ container, amount, company, cz, date })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            msgEl.innerText = '✓ Сохранено';
            setTimeout(() => { resetForm(); loadAll(); }, 1400);
        }
    })
    .catch(() => { msgEl.innerText = 'Ошибка при сохранении'; });
}

/* ══ Load everything ══ */
function loadAll() {
    fetch('/api/reports', { headers: { 'x-access-key': currentKey } })
        .then(r => r.json())
        .then(reports => {
            renderStats(reports);
            renderReports(reports);
        })
        .catch(() => {
            document.getElementById('reportsContent').innerHTML = '<div class="empty">Ошибка загрузки</div>';
        });
}

/* ══ Stats ══ */
function renderStats(reports) {
    if (!reports || !reports.length) return;
    const total = reports.reduce((s,r) => s + r.amount + (r.cz ? r.cz*150 : 0), 0);
    const containers = new Set(reports.map(r => r.container)).size;
    const avg = total / reports.length;

    document.getElementById('statCount').innerText      = reports.length;
    document.getElementById('statTotal').innerHTML      = shortNum(total) + ' <span class="stat-rub">₽</span>';
    document.getElementById('statContainers').innerText = containers;
    document.getElementById('statAvg').innerHTML        = shortNum(avg) + ' <span class="stat-rub">₽</span>';
}

function shortNum(n) {
    return Math.round(n).toLocaleString("ru-RU");
}

/* ══ Reports ══ */
const MONTHS_NOM  = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN  = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function renderReports(reports) {
    const el = document.getElementById('reportsContent');
    if (!reports || !reports.length) { el.innerHTML = '<div class="empty">Нет отчётов</div>'; return; }

    const grouped = {};
    reports.forEach(r => {
        const k = r.date.substring(0,7);
        (grouped[k] = grouped[k]||[]).push(r);
    });

    let html = '';
    Object.keys(grouped).sort().reverse().forEach(key => {
        const items = grouped[key];
        const [yr, mn] = key.split('-');
        const first  = items.filter(r => +r.date.split('-')[2] <= 15);
        const second = items.filter(r => +r.date.split('-')[2] > 15);
        const sum    = arr => arr.reduce((s,r) => s + r.amount + (r.cz ? r.cz*150 : 0), 0);
        const f = sum(first), s = sum(second), tot = f + s;

        html += `
        <div class="month-card">
          <div class="month-header" onclick="toggleMonth(this)">
            <div class="month-left">
              <h4>${MONTHS_NOM[+mn-1]} ${yr}</h4>
              <span class="month-badge">${items.length} ${noun(items.length)}</span>
            </div>
            <span class="month-total">${fmt(tot)} ₽</span>
          </div>
          <div class="quarters">
            <div class="quarter">
              <div class="quarter-header" onclick="toggleQuarter(this)">
                <span>1–15 число</span><span class="quarter-sum">${fmt(f)} ₽</span>
              </div>
              <div class="reports-list">${itemsHTML(first)}</div>
            </div>
            <div class="quarter">
              <div class="quarter-header" onclick="toggleQuarter(this)">
                <span>16–31 число</span><span class="quarter-sum">${fmt(s)} ₽</span>
              </div>
              <div class="reports-list">${itemsHTML(second)}</div>
            </div>
          </div>
        </div>`;
    });
    el.innerHTML = html;
}

function itemsHTML(items) {
    if (!items.length) return '<div class="empty">Нет записей</div>';
    return items.map(r => {
        const d   = new Date(r.date);
        const dat = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
        const cz  = r.cz ?? 0;
        return `
        <div class="report-item">
          <div class="report-line"><span class="report-label">Контейнер</span><span class="report-value">${r.container}</span></div>
          <div class="report-line"><span class="report-label">Сумма</span><span class="report-value">${fmt(r.amount)} ₽</span></div>
          <div class="report-line"><span class="report-label">Компания</span><span class="report-value">${r.company}</span></div>
          <div class="report-line"><span class="report-label">ЧЗ</span><span class="report-value">${cz}</span></div>
          <div class="report-line report-line--total"><span class="report-label">Итого</span><span class="report-value report-value--total">${fmt(r.amount + cz*150)} ₽</span></div>
          <div class="report-line"><span class="report-label">Дата</span><span class="report-value">${dat}</span></div>
        </div>`;
    }).join('');
}

/* toggles */
function toggleMonth(el) {
    const q = el.closest('.month-card').querySelector('.quarters');
    q.style.display = q.style.display === 'flex' ? 'none' : 'flex';
}
function toggleQuarter(el) {
    const l = el.closest('.quarter').querySelector('.reports-list');
    l.style.display = l.style.display === 'flex' ? 'none' : 'flex';
}

/* utils */
function fmt(n) {
    return n.toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function noun(n) {
    if (n%100>=11&&n%100<=19) return 'отчётов';
    switch(n%10){ case 1: return 'отчёт'; case 2: case 3: case 4: return 'отчёта'; }
    return 'отчётов';
}

/* attach preview listeners after DOM ready */
document.addEventListener('DOMContentLoaded', () => {
    const a = document.getElementById('amount');
    const c = document.getElementById('cz');
    if (a) a.addEventListener('input', updatePreview);
    if (c) c.addEventListener('input', updatePreview);
});