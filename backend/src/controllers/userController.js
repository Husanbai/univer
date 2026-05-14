const pool = require('../config/database');
const logger = require('../config/logger');
const { writeAuditLog } = require('../database/auditLog');
const bcrypt = require('bcryptjs');

/**
 * GET /api/users — Список всех пользователей (только admin)
 */
async function getAllUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.is_active, u.is_verified,
              u.failed_login_attempts, u.last_login, u.created_at,
              r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       ORDER BY u.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (err) {
    logger.error('Ошибка получения списка пользователей:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * GET /api/users/:id — Получить пользователя по ID
 */
async function getUserById(req, res) {
  const { id } = req.params;

  // Обычный пользователь может видеть только свой профиль
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ success: false, message: 'Доступ запрещён' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.is_active, u.is_verified,
              u.last_login, u.created_at, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Ошибка получения пользователя:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * PUT /api/users/:id/role — Изменить роль пользователя (только admin)
 */
async function updateUserRole(req, res) {
  const { id } = req.params;
  const { role } = req.body;

  try {
    const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Такая роль не существует' });
    }

    await pool.query('UPDATE users SET role_id = $1 WHERE id = $2', [
      roleResult.rows[0].id,
      id,
    ]);

    await writeAuditLog({
      userId: req.user.id,
      action: 'UPDATE_USER_ROLE',
      details: { targetUserId: id, newRole: role },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.status(200).json({ success: true, message: `Роль обновлена на "${role}"` });
  } catch (err) {
    logger.error('Ошибка обновления роли:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * PUT /api/users/:id/status — Активировать/деактивировать аккаунт (только admin)
 */
async function updateUserStatus(req, res) {
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, id]);

    await writeAuditLog({
      userId: req.user.id,
      action: is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      details: { targetUserId: id },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.status(200).json({
      success: true,
      message: is_active ? 'Аккаунт активирован' : 'Аккаунт деактивирован',
    });
  } catch (err) {
    logger.error('Ошибка изменения статуса:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * PUT /api/users/me/password — Смена пароля текущим пользователем
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Текущий пароль неверен' });
    }

    const newHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    // Отзываем все refresh токены — требуем повторного входа на всех устройствах
    await pool.query('UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1', [req.user.id]);

    await writeAuditLog({
      userId: req.user.id,
      action: 'CHANGE_PASSWORD',
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.status(200).json({
      success: true,
      message: 'Пароль успешно изменён. Выполните вход заново на всех устройствах.',
    });
  } catch (err) {
    logger.error('Ошибка смены пароля:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * GET /api/users/audit-logs — Просмотр аудит-логов (только admin)
 */
async function getAuditLogs(req, res) {
  const { limit = 50, offset = 0 } = req.query;

  try {
    const result = await pool.query(
      `SELECT al.*, u.username, u.email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query('SELECT COUNT(*) FROM audit_logs');

    return res.status(200).json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    logger.error('Ошибка получения логов:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = { getAllUsers, getUserById, updateUserRole, updateUserStatus, changePassword, getAuditLogs };
