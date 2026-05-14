const pool = require('../config/database');
const logger = require('../config/logger');

/**
 * Записывает действие пользователя в таблицу audit_logs
 */
async function writeAuditLog({ userId, action, details, ipAddress, userAgent, success = true }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, details, ip_address, user_agent, success)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, action, JSON.stringify(details || {}), ipAddress, userAgent, success]
    );
  } catch (err) {
    logger.error('Ошибка записи аудит-лога:', err);
  }
}

module.exports = { writeAuditLog };
