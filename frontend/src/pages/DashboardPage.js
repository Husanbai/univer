import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import './Dashboard.css';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('profile');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [message, setMessage] = useState({ text: '', type: '' });

  const isAdmin = user?.role === 'admin';
  const isModerator = user?.role === 'moderator';

  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then(({ data }) => setUsers(data.data)).catch(console.error);
    }
  }, [isAdmin]);

  const loadLogs = async () => {
    if (isAdmin) {
      const { data } = await api.get('/users/audit-logs');
      setLogs(data.data);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'logs') loadLogs();
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirm) {
      return setMessage({ text: 'Пароли не совпадают', type: 'error' });
    }
    try {
      await api.put('/users/me/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setMessage({ text: 'Пароль успешно изменён! Войдите заново.', type: 'success' });
      setTimeout(handleLogout, 2000);
    } catch (err) {
      setMessage({ text: err.response?.data?.message || 'Ошибка', type: 'error' });
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      await api.put(`/users/${userId}/status`, { is_active: !currentStatus });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: !currentStatus } : u));
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка');
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      await api.put(`/users/${userId}/role`, { role: newRole });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка');
    }
  };

  const roleColors = { admin: '#ef4444', moderator: '#f59e0b', user: '#3b82f6' };

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="avatar">{user?.username?.[0]?.toUpperCase()}</div>
          <div>
            <strong>{user?.username}</strong>
            <span
              className="role-badge"
              style={{ backgroundColor: roleColors[user?.role] || '#6b7280' }}
            >
              {user?.role}
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => handleTabChange('profile')}>
            👤 Мой профиль
          </button>
          <button className={activeTab === 'password' ? 'active' : ''} onClick={() => handleTabChange('password')}>
            🔑 Сменить пароль
          </button>
          {(isAdmin || isModerator) && (
            <button className={activeTab === 'users' ? 'active' : ''} onClick={() => handleTabChange('users')}>
              👥 Пользователи
            </button>
          )}
          {isAdmin && (
            <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => handleTabChange('logs')}>
              📋 Аудит-логи
            </button>
          )}
        </nav>

        <button className="btn-logout" onClick={handleLogout}>🚪 Выйти</button>
      </aside>

      <main className="main-content">
        {/* ======== ПРОФИЛЬ ======== */}
        {activeTab === 'profile' && (
          <div className="panel">
            <h2>👤 Мой профиль</h2>
            <div className="info-grid">
              <div className="info-item"><label>Имя пользователя</label><span>{user?.username}</span></div>
              <div className="info-item"><label>Email</label><span>{user?.email}</span></div>
              <div className="info-item">
                <label>Роль</label>
                <span className="role-badge" style={{ backgroundColor: roleColors[user?.role] }}>
                  {user?.role}
                </span>
              </div>
              <div className="info-item">
                <label>Последний вход</label>
                <span>{user?.last_login ? new Date(user.last_login).toLocaleString('ru-RU') : 'Нет данных'}</span>
              </div>
              <div className="info-item">
                <label>Дата регистрации</label>
                <span>{user?.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* ======== СМЕНА ПАРОЛЯ ======== */}
        {activeTab === 'password' && (
          <div className="panel">
            <h2>🔑 Смена пароля</h2>
            {message.text && (
              <div className={`alert alert-${message.type}`}>{message.text}</div>
            )}
            <form onSubmit={handleChangePassword} className="auth-form">
              <div className="form-group">
                <label>Текущий пароль</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Новый пароль</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  required
                  placeholder="Минимум 8 символов"
                />
              </div>
              <div className="form-group">
                <label>Подтвердите новый пароль</label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary">Изменить пароль</button>
            </form>
          </div>
        )}

        {/* ======== ПОЛЬЗОВАТЕЛИ (Admin/Moderator) ======== */}
        {activeTab === 'users' && (
          <div className="panel">
            <h2>👥 Управление пользователями</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Email</th>
                    <th>Роль</th>
                    <th>Статус</th>
                    <th>Последний вход</th>
                    {isAdmin && <th>Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.email}</td>
                      <td>
                        <span className="role-badge" style={{ backgroundColor: roleColors[u.role] || '#6b7280' }}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${u.is_active ? 'active' : 'inactive'}`}>
                          {u.is_active ? '✅ Активен' : '❌ Заблокирован'}
                        </span>
                      </td>
                      <td>{u.last_login ? new Date(u.last_login).toLocaleString('ru-RU') : '—'}</td>
                      {isAdmin && (
                        <td className="actions">
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeRole(u.id, e.target.value)}
                            disabled={u.id === user.id}
                          >
                            <option value="user">user</option>
                            <option value="moderator">moderator</option>
                            <option value="admin">admin</option>
                          </select>
                          <button
                            className={`btn-small ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => handleToggleStatus(u.id, u.is_active)}
                            disabled={u.id === user.id}
                          >
                            {u.is_active ? 'Заблокировать' : 'Активировать'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======== АУДИТ-ЛОГИ (Admin) ======== */}
        {activeTab === 'logs' && (
          <div className="panel">
            <h2>📋 Журнал аудита</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Пользователь</th>
                    <th>Действие</th>
                    <th>IP-адрес</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.created_at).toLocaleString('ru-RU')}</td>
                      <td>{log.username || '—'}</td>
                      <td><code>{log.action}</code></td>
                      <td>{log.ip_address || '—'}</td>
                      <td>
                        <span className={`status-badge ${log.success ? 'active' : 'inactive'}`}>
                          {log.success ? '✅' : '❌'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
