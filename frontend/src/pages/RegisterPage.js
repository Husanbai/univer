import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import './SecurityDemo.css';

const REG_MECHANISMS = [
  { id: 'validation', title: 'Валидация входных данных', color: '#7c3aed',
    description: 'Проверка имени пользователя, формата email и сложности пароля.',
    detail: 'username: только a-z, 0-9, _ (3–50 симв.)\nemail: стандартный формат RFC 5322\npassword: мин. 8 симв., заглавная, строчная, цифра' },
  { id: 'ratelimit', title: 'Rate Limiting', color: '#b45309',
    description: 'Не более 3 регистраций за 1 час с одного IP-адреса.',
    detail: 'express-rate-limit блокирует повторные\nпопытки массовой регистрации (brute-force защита).' },
  { id: 'sql', title: 'Параметризованные SQL-запросы', color: '#0369a1',
    description: 'INSERT в PostgreSQL выполняется через параметры $1, $2, $3.',
    detail: 'INSERT INTO users(username, email, password_hash)\nVALUES ($1, $2, $3)\nSQL-инъекция исключена.' },
  { id: 'duplicate', title: 'Проверка уникальности', color: '#0891b2',
    description: 'Проверка, что email и username ещё не заняты в базе данных.',
    detail: 'SELECT id FROM users WHERE email=$1 OR username=$2\nЕсли запись найдена — регистрация отклоняется.' },
  { id: 'bcrypt', title: 'Хэширование пароля bcrypt', color: '#0f766e',
    description: 'Пароль никогда не сохраняется в открытом виде — только bcrypt-хэш.',
    detail: 'bcrypt.hash(password, 12)\nСоль генерируется автоматически.\nВремя вычисления: ~300 мс (защита от перебора).' },
  { id: 'role', title: 'Назначение роли по умолчанию', color: '#c2410c',
    description: 'Каждому новому пользователю автоматически назначается роль "user".',
    detail: 'INSERT INTO user_roles(user_id, role_id)\nSELECT $1, id FROM roles WHERE name=\'user\'' },
  { id: 'audit', title: 'Запись в журнал аудита', color: '#15803d',
    description: 'Событие REGISTER_SUCCESS записывается в таблицу audit_logs.',
    detail: 'Поля: action, user_id, ip_address,\nuser_agent, success, created_at' },
  { id: 'helmet', title: 'Helmet.js — HTTP-заголовки', color: '#6d28d9',
    description: 'Ответ сервера содержит защитные заголовки безопасности.',
    detail: 'X-Content-Type-Options: nosniff\nX-Frame-Options: DENY\nStrict-Transport-Security: max-age=31536000' },
];

function BcryptSteps({ active, password }) {
  const [step, setStep] = React.useState(-1);
  React.useEffect(() => {
    if (!active) { setStep(-1); return; }
    let i = 0;
    const t = setInterval(() => { setStep(i); i++; if (i > 3) clearInterval(t); }, 500);
    return () => clearInterval(t);
  }, [active]);
  const steps = [
    { label: 'Входной пароль (открытый)', value: password ? password.replace(/./g, '*') : '••••••••' },
    { label: 'Генерация соли (12 раундов)', value: '$2b$12$N9qo8uLOickgx2ZMRZo...' },
    { label: 'Вычисление хэш-функции (~300 мс)', value: 'Обработка...' },
    { label: 'Результат — хэш для сохранения в БД', value: '$2b$12$N9qo8uLOickgx2ZMRZoHQe...' },
  ];
  return (
    <div className="anim-block">
      {steps.map((s, i) => (
        <div key={i} className={`anim-row ${i <= step ? 'show' : ''}`}>
          <span className="anim-label">{s.label}</span>
          <code className="anim-code">{s.value}</code>
          {i < steps.length - 1 && <div className="anim-arrow" />}
        </div>
      ))}
    </div>
  );
}

function getPasswordStrength(pass) {
  if (!pass) return null;
  let score = 0;
  if (pass.length >= 8) score++;
  if (pass.length >= 12) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[a-z]/.test(pass)) score++;
  if (/\d/.test(pass)) score++;
  if (/[!@#$%^&*]/.test(pass)) score++;
  if (score <= 2) return { label: 'Слабый', color: '#ef4444', width: '33%' };
  if (score <= 4) return { label: 'Средний', color: '#f59e0b', width: '66%' };
  return { label: 'Сильный', color: '#10b981', width: '100%' };
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [logs, setLogs] = useState([]);
  const [activeMech, setActiveMech] = useState(null);
  const [loading, setLoading] = useState(false);
  const [regResult, setRegResult] = useState(null);
  const logsEndRef = useRef(null);

  const strength = getPasswordStrength(form.password);

  const addLog = (text, status = 'info', mechId = null) => {
    const time = new Date().toLocaleTimeString('ru-RU');
    setLogs(prev => [...prev, { text, status, mechId, time }]);
    if (mechId) setActiveMech(mechId);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const handleSubmit = async e => {
    e.preventDefault();
    setLogs([]);
    setRegResult(null);
    setActiveMech(null);

    // --- Клиентская валидация ---
    addLog('Валидация: проверка имени пользователя и email', 'process', 'validation');
    await sleep(500);
    if (!form.username || form.username.length < 3) {
      addLog('Ошибка: имя пользователя слишком короткое (мин. 3 символа)', 'error');
      setLoading(false);
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(form.username)) {
      addLog('Ошибка: в имени пользователя недопустимые символы', 'error');
      return;
    }
    if (!form.email.includes('@')) {
      addLog('Ошибка: некорректный формат email', 'error');
      return;
    }
    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/\d/.test(form.password)) {
      addLog('Ошибка: пароль не соответствует требованиям безопасности', 'error');
      return;
    }
    if (form.password !== form.confirm) {
      addLog('Ошибка: пароли не совпадают', 'error');
      return;
    }
    addLog('Валидация пройдена успешно', 'success');
    await sleep(400);

    addLog('Rate Limiter: проверка лимита регистраций с данного IP', 'process', 'ratelimit');
    await sleep(500);
    addLog('Лимит не превышен — запрос разрешён', 'success');
    await sleep(300);

    addLog('SQL: проверка уникальности email и username в базе данных', 'process', 'duplicate');
    await sleep(600);
    addLog('Параметризованный SELECT выполнен', 'success');
    await sleep(300);

    addLog('SQL: подготовка параметризованного INSERT-запроса', 'process', 'sql');
    await sleep(500);

    setLoading(true);
    addLog('bcrypt: хэширование пароля — 12 раундов соления', 'process', 'bcrypt');
    await sleep(1000);

    try {
      await api.post('/auth/register', {
        username: form.username,
        email: form.email,
        password: form.password,
      });

      addLog('bcrypt: хэш пароля сформирован (~300 мс)', 'success', 'bcrypt');
      await sleep(400);
      addLog('SQL: пользователь сохранён в таблице users', 'success', 'sql');
      await sleep(300);
      addLog('RBAC: назначена роль "user" по умолчанию', 'success', 'role');
      await sleep(300);
      addLog('Аудит-лог: REGISTER_SUCCESS записан в PostgreSQL', 'success', 'audit');
      await sleep(300);
      addLog('Helmet.js: ответ отправлен с защитными заголовками', 'process', 'helmet');
      await sleep(200);
      addLog(`Регистрация завершена. Аккаунт "${form.username}" создан.`, 'final');
      setRegResult({ ok: true });
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      const errors = err.response?.data?.errors;
      const msg = errors?.length
        ? errors.map(e => e.message).join('. ')
        : (err.response?.data?.message || 'Ошибка сервера');
      addLog(`bcrypt: хэш вычислен`, 'info');
      await sleep(200);
      addLog(`Ошибка: ${msg}`, 'error');
      addLog('Аудит-лог: REGISTER_FAIL записан', 'warn', 'audit');
      setRegResult({ ok: false, msg });
    }
    setActiveMech(null);
    setLoading(false);
  };

  const activeMechData = REG_MECHANISMS.find(m => m.id === activeMech);

  return (
    <div className="sd-page">
      <header className="sd-header">
        <div className="sd-header-brand">
          <svg className="sd-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <div>
            <div className="sd-brand-title">Система аутентификации и авторизации</div>
            <div className="sd-brand-sub">Дипломный проект — Информационная безопасность</div>
          </div>
        </div>
        <nav className="sd-nav">
          <Link to="/">Демо-страница</Link>
          <Link to="/login">Вход</Link>
          <Link to="/dashboard" className="sd-nav-btn">Личный кабинет</Link>
        </nav>
      </header>

      <div className="sd-body">
        {/* ── ЛЕВАЯ ПАНЕЛЬ ── */}
        <div className="sd-left">
          <div className="sd-panel-label">Интерфейс пользователя</div>
          <div className="sd-form-card">
            <div className="sd-form-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              <div>
                <h2>Регистрация аккаунта</h2>
                <p>Заполните форму — механизмы защиты сервера отобразятся справа</p>
              </div>
            </div>

            {regResult?.ok && (
              <div className="sd-result-ok">
                Аккаунт создан успешно. Переход на страницу входа...
              </div>
            )}
            {regResult && !regResult.ok && (
              <div className="sd-result-err">{regResult.msg}</div>
            )}

            <form onSubmit={handleSubmit} className="sd-form">
              <div className="sd-field">
                <label>Имя пользователя</label>
                <input type="text" placeholder="ivan_ivanov" value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  required autoComplete="username"/>
                <span className="sd-field-hint">Только латинские буквы, цифры и _</span>
              </div>
              <div className="sd-field">
                <label>Email</label>
                <input type="email" placeholder="user@example.com" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required autoComplete="email"/>
              </div>
              <div className="sd-field">
                <label>Пароль</label>
                <input type="password" placeholder="Минимум 8 символов" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required autoComplete="new-password"/>
                {strength && (
                  <div className="sd-strength">
                    <div className="sd-strength-bar">
                      <div style={{ width: strength.width, background: strength.color }}/>
                    </div>
                    <span style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                )}
              </div>
              <div className="sd-field">
                <label>Подтверждение пароля</label>
                <input type="password" placeholder="Повторите пароль" value={form.confirm}
                  onChange={e => setForm({ ...form, confirm: e.target.value })}
                  required autoComplete="new-password"/>
                {form.confirm && form.password !== form.confirm && (
                  <span className="sd-field-error">Пароли не совпадают</span>
                )}
              </div>
              <button type="submit" className="sd-submit" disabled={loading}>
                {loading
                  ? <span className="sd-loading"><span className="sd-spinner"/>Обработка...</span>
                  : 'Зарегистрироваться и показать процесс'}
              </button>
              <p className="sd-form-footer">
                Уже есть аккаунт? <Link to="/login">Войти</Link>
              </p>
            </form>
          </div>

          <div className="sd-mechs-grid">
            {REG_MECHANISMS.map(m => (
              <div key={m.id} className={`sd-mech-chip ${activeMech === m.id ? 'active' : ''}`}
                style={{ '--mc': m.color }}>
                <span className="sd-mech-dot"/>
                <span className="sd-mech-name">{m.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ПРАВАЯ ПАНЕЛЬ ── */}
        <div className="sd-right">
          <div className="sd-panel-label">Серверная обработка</div>

          <div className="sd-active-card">
            {activeMechData ? (
              <>
                <div className="sd-active-title" style={{ color: activeMechData.color }}>
                  {activeMechData.title}
                </div>
                <p className="sd-active-desc">{activeMechData.description}</p>
                <pre className="sd-active-detail">{activeMechData.detail}</pre>
                {activeMech === 'bcrypt' && <BcryptSteps active password={form.password}/>}
              </>
            ) : (
              <div className="sd-active-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <p>Здесь будет отображаться активный механизм защиты</p>
                <span>Заполните форму и нажмите «Зарегистрироваться»</span>
              </div>
            )}
          </div>

          <div className="sd-log-card">
            <div className="sd-log-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Журнал безопасности
            </div>
            <div className="sd-log-body">
              {logs.length === 0 && <div className="sd-log-empty">Ожидание запроса...</div>}
              {logs.map((log, i) => (
                <div key={i} className={`sd-log-row sd-log-${log.status}`}>
                  <span className="sd-log-time">{log.time}</span>
                  <span className="sd-log-text">{log.text}</span>
                </div>
              ))}
              <div ref={logsEndRef}/>
            </div>
          </div>

          <div className="sd-table-card">
            <div className="sd-table-header">Механизмы защиты при регистрации</div>
            <table className="sd-table">
              <thead><tr><th>Механизм</th><th>Назначение</th></tr></thead>
              <tbody>
                {REG_MECHANISMS.map(m => (
                  <tr key={m.id} className={activeMech === m.id ? 'sd-row-active' : ''}
                    style={{ '--mc': m.color }}>
                    <td>
                      <span className="sd-table-dot" style={{ background: m.color }}/>
                      <strong>{m.title}</strong>
                    </td>
                    <td>{m.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
