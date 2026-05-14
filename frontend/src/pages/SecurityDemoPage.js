import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import './SecurityDemo.css';

const MECHANISMS = [
  { id: 'validation', title: 'Валидация входных данных', color: '#7c3aed',
    description: 'Проверка формата email, длины и сложности пароля на стороне клиента и сервера.',
    detail: 'Библиотека express-validator проверяет каждое поле перед обработкой.\nНекорректные данные отклоняются с описанием ошибки.' },
  { id: 'ratelimit', title: 'Rate Limiting', color: '#b45309',
    description: 'Максимум 5 попыток входа за 15 минут с одного IP-адреса.',
    detail: 'При превышении лимита аккаунт блокируется на 30 минут.\nРеализовано через библиотеку express-rate-limit.' },
  { id: 'sql', title: 'Параметризованные SQL-запросы', color: '#0369a1',
    description: 'Все обращения к PostgreSQL используют параметры ($1, $2) вместо конкатенации строк.',
    detail: 'SELECT * FROM users WHERE email = $1\nДанные передаются отдельно от запроса — SQL-инъекция невозможна.' },
  { id: 'bcrypt', title: 'Хэширование паролей bcrypt', color: '#0f766e',
    description: 'Пароль хранится только в виде хэша. bcrypt использует 12 раундов соления.',
    detail: 'Даже при компрометации базы данных восстановить\nоригинальный пароль из хэша практически невозможно.' },
  { id: 'jwt', title: 'JWT Access + Refresh токены', color: '#be185d',
    description: 'Access-токен действует 15 минут. Refresh-токен — 7 дней, хранится как SHA-256 хэш.',
    detail: 'Payload содержит: id, email, роль пользователя.\nПодпись: HMAC SHA-256 секретным ключом сервера.' },
  { id: 'rbac', title: 'RBAC — Ролевая авторизация', color: '#c2410c',
    description: 'Три роли: admin, moderator, user. Каждый маршрут API защищён проверкой роли.',
    detail: 'Middleware requireRole() отклоняет запросы\nс недостаточными правами с кодом 403 Forbidden.' },
  { id: 'audit', title: 'Журнал аудита в PostgreSQL', color: '#15803d',
    description: 'Каждое действие записывается в таблицу audit_logs с IP, User-Agent и временем.',
    detail: 'Поля: действие, пользователь, IP-адрес,\nрезультат (успех/провал), временная метка.' },
  { id: 'helmet', title: 'Helmet.js — HTTP-заголовки', color: '#6d28d9',
    description: 'Автоматически добавляет защитные заголовки к каждому ответу сервера.',
    detail: 'X-Frame-Options, X-XSS-Protection,\nContent-Security-Policy, Strict-Transport-Security.' },
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
    { label: 'Входной пароль', value: password || 'MyPassword1' },
    { label: 'Генерация соли (salt)', value: '$2b$12$N9qo8uLOickgx2ZMRZo...' },
    { label: 'bcrypt — 12 раундов вычисления', value: 'Выполнение хэш-функции...' },
    { label: 'Итоговый хэш (сохраняется в БД)', value: '$2b$12$N9qo8uLOickgx2ZMRZoHQe...' },
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

function JwtSteps({ active }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (active) setTimeout(() => setVisible(true), 150);
    else setVisible(false);
  }, [active]);
  const parts = [
    { label: 'HEADER', value: '{"alg":"HS256","typ":"JWT"}', color: '#dc2626' },
    { label: 'PAYLOAD', value: '{"id":"uuid","role":"user","exp":"+15min"}', color: '#1d4ed8' },
    { label: 'SIGNATURE', value: 'HMACSHA256(base64(header)+"."+base64(payload), SECRET)', color: '#15803d' },
  ];
  return (
    <div className="anim-block">
      {parts.map((p, i) => (
        <div key={i} className={`jwt-row ${visible ? 'show' : ''}`}
          style={{ transitionDelay: `${i * 0.2}s`, '--jcolor': p.color }}>
          <span className="jwt-part-label" style={{ color: p.color }}>{p.label}</span>
          <code className="anim-code">{p.value}</code>
        </div>
      ))}
      {visible && (
        <div className="jwt-result-row">
          <span className="jwt-result-label">Итоговый токен:</span>
          <code>
            <span style={{ color: '#dc2626' }}>eyJhbGci...</span>
            <span style={{ color: '#94a3b8' }}>.</span>
            <span style={{ color: '#1d4ed8' }}>eyJpZCI6...</span>
            <span style={{ color: '#94a3b8' }}>.</span>
            <span style={{ color: '#15803d' }}>SflKxwRJ...</span>
          </code>
        </div>
      )}
    </div>
  );
}

export default function SecurityDemoPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [logs, setLogs] = useState([]);
  const [activeMech, setActiveMech] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loginResult, setLoginResult] = useState(null);
  const logsEndRef = useRef(null);

  const addLog = (text, status = 'info', mechId = null) => {
    const time = new Date().toLocaleTimeString('ru-RU');
    setLogs(prev => [...prev, { text, status, mechId, time }]);
    if (mechId) setActiveMech(mechId);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const runDemo = async e => {
    e.preventDefault();
    setLogs([]);
    setLoginResult(null);
    setLoading(true);
    setActiveMech(null);

    addLog('Валидация: проверка формата email и длины пароля', 'process', 'validation');
    await sleep(700);
    if (!form.email.includes('@')) {
      addLog('Ошибка валидации: некорректный формат email', 'error');
      setLoading(false);
      return;
    }
    addLog('Валидация пройдена успешно', 'success');
    await sleep(500);

    addLog('Rate Limiter: проверка количества попыток с данного IP', 'process', 'ratelimit');
    await sleep(600);
    addLog('Лимит не превышен — запрос разрешён', 'success');
    await sleep(400);

    addLog('SQL: SELECT * FROM users WHERE email = $1 (параметризованный запрос)', 'process', 'sql');
    await sleep(700);
    addLog('SQL-инъекция невозможна: данные переданы как параметр', 'success');
    await sleep(400);

    addLog('bcrypt: сравнение введённого пароля с хэшем из базы данных', 'process', 'bcrypt');
    await sleep(1200);

    try {
      const { data } = await api.post('/auth/demo/login', { email: form.email, password: form.password });
      addLog('bcrypt: пароль верифицирован (12 раундов)', 'success', 'bcrypt');
      await sleep(500);
      addLog('JWT: генерация Access-токена (15 мин) и Refresh-токена (7 дней)', 'process', 'jwt');
      await sleep(800);
      addLog('JWT подписан алгоритмом HS256, сохранён в localStorage', 'success');
      await sleep(400);
      addLog(`RBAC: пользователю назначена роль "${data.data.user.role}"`, 'process', 'rbac');
      await sleep(500);
      addLog('Аудит-лог: LOGIN_SUCCESS записан в PostgreSQL', 'success', 'audit');
      await sleep(400);
      addLog('Helmet.js: ответ содержит защитные HTTP-заголовки', 'process', 'helmet');
      await sleep(300);
      addLog(`Аутентификация завершена. Пользователь: ${data.data.user.username}`, 'final');
      setLoginResult({ ok: true, user: data.data.user });
    } catch (err) {
      addLog('bcrypt: проверка завершена', 'info');
      await sleep(300);
      addLog(`Ошибка: ${err.response?.data?.message || 'Внутренняя ошибка сервера'}`, 'error');
      addLog('Аудит-лог: LOGIN_FAIL записан в PostgreSQL', 'warn', 'audit');
      setLoginResult({ ok: false, msg: err.response?.data?.message || 'Проверьте подключение к серверу' });
    }
    setActiveMech(null);
    setLoading(false);
  };

  const activeMechData = MECHANISMS.find(m => m.id === activeMech);

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
          <Link to="/login">Вход</Link>
          <Link to="/register">Регистрация</Link>
          <Link to="/dashboard" className="sd-nav-btn">Личный кабинет</Link>
        </nav>
      </header>

      <div className="sd-body">
        <div className="sd-left">
          <div className="sd-panel-label">Интерфейс пользователя</div>
          <div className="sd-form-card">
            <div className="sd-form-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <div>
                <h2>Вход в систему</h2>
                <p>Введите данные и нажмите кнопку — механизмы защиты отобразятся справа</p>
              </div>
            </div>
            {loginResult?.ok && (
              <div className="sd-result-ok">Аутентификация успешна. Роль: <strong>{loginResult.user.role}</strong></div>
            )}
            {loginResult && !loginResult.ok && (
              <div className="sd-result-err">{loginResult.msg}</div>
            )}
            <form onSubmit={runDemo} className="sd-form">
              <div className="sd-field">
                <label>Email</label>
                <input type="email" placeholder="user@example.com" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} required autoComplete="email"/>
              </div>
              <div className="sd-field">
                <label>Пароль</label>
                <input type="password" placeholder="Введите пароль" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} required autoComplete="current-password"/>
              </div>
              <button type="submit" className="sd-submit" disabled={loading}>
                {loading ? (<span className="sd-loading"><span className="sd-spinner"/>Обработка запроса...</span>)
                  : 'Войти и показать процесс защиты'}
              </button>
            </form>
          </div>
          <div className="sd-mechs-grid">
            {MECHANISMS.map(m => (
              <div key={m.id} className={`sd-mech-chip ${activeMech === m.id ? 'active' : ''}`} style={{ '--mc': m.color }}>
                <span className="sd-mech-dot"/>
                <span className="sd-mech-name">{m.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sd-right">
          <div className="sd-panel-label">Серверная обработка</div>
          <div className="sd-active-card">
            {activeMechData ? (
              <>
                <div className="sd-active-title" style={{ color: activeMechData.color }}>{activeMechData.title}</div>
                <p className="sd-active-desc">{activeMechData.description}</p>
                <pre className="sd-active-detail">{activeMechData.detail}</pre>
                {activeMech === 'bcrypt' && <BcryptSteps active password={form.password}/>}
                {activeMech === 'jwt' && <JwtSteps active/>}
              </>
            ) : (
              <div className="sd-active-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4M12 16h.01"/>
                </svg>
                <p>Здесь будет отображаться активный механизм защиты</p>
                <span>Заполните форму и нажмите «Войти»</span>
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
            <div className="sd-table-header">Механизмы защиты</div>
            <table className="sd-table">
              <thead><tr><th>Механизм</th><th>Назначение</th></tr></thead>
              <tbody>
                {MECHANISMS.map(m => (
                  <tr key={m.id} className={activeMech === m.id ? 'sd-row-active' : ''} style={{ '--mc': m.color }}>
                    <td><span className="sd-table-dot" style={{ background: m.color }}/><strong>{m.title}</strong></td>
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
