const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

/**
 * Проверяет JWT access токен из заголовка Authorization
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Токен доступа отсутствует. Авторизуйтесь.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Токен истёк. Обновите токен.',
        code: 'TOKEN_EXPIRED',
      });
    }
    logger.warn(`Недействительный токен: ${err.message}`);
    return res.status(403).json({
      success: false,
      message: 'Недействительный токен.',
    });
  }
}

/**
 * Проверяет роль пользователя (RBAC)
 * Использование: requireRole('admin') или requireRole('admin', 'moderator')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Не авторизован' });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(
        `Попытка доступа с ролью "${req.user.role}" к защищённому ресурсу (требуется: ${roles.join(', ')})`
      );
      return res.status(403).json({
        success: false,
        message: 'Недостаточно прав для выполнения этого действия.',
      });
    }

    next();
  };
}

module.exports = { authenticateToken, requireRole };
