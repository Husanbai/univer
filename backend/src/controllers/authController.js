const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('../config/database');
const logger = require('../config/logger');
const { writeAuditLog } = require('../database/auditLog');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

/**
 * Генерация пары токенов: access + refresh
 */
function generateTokens(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role_name,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );

  return { accessToken, refreshToken };
}

/**
 * POST /api/auth/register — Регистрация нового пользователя
 */
async function register(req, res) {
  const { username, email, password } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  try {
    // Проверяем: пользователь уже существует?
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username]
    );

    if (existingUser.rows.length > 0) {
      await writeAuditLog({
        action: 'REGISTER_FAIL',
        details: { reason: 'Пользователь уже существует', email },
        ipAddress,
        userAgent,
        success: false,
      });
      return res.status(409).json({
        success: false,
        message: 'Пользователь с таким email или именем уже существует.',
      });
    }

    // Хэшируем пароль с bcrypt
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Создаём пользователя (роль 2 = user по умолчанию)
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role_id)
       VALUES ($1, $2, $3, 2)
       RETURNING id, username, email, created_at`,
      [username, email.toLowerCase(), passwordHash]
    );

    const newUser = result.rows[0];

    await writeAuditLog({
      userId: newUser.id,
      action: 'REGISTER_SUCCESS',
      details: { username, email },
      ipAddress,
      userAgent,
    });

    logger.info(`Новый пользователь зарегистрирован: ${username} (${email})`);

    return res.status(201).json({
      success: true,
      message: 'Регистрация прошла успешно!',
      data: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (err) {
    logger.error('Ошибка регистрации:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * POST /api/auth/login — Вход в систему
 */
async function login(req, res) {
  const { email, password } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  try {
    // Получаем пользователя вместе с ролью
    const result = await pool.query(
      `SELECT u.*, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    // Пользователь не найден
    if (!user) {
      await writeAuditLog({
        action: 'LOGIN_FAIL',
        details: { reason: 'Пользователь не найден', email },
        ipAddress,
        userAgent,
        success: false,
      });
      return res.status(401).json({
        success: false,
        message: 'Неверный email или пароль.',
      });
    }

    // Аккаунт заблокирован?
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return res.status(423).json({
        success: false,
        message: `Аккаунт временно заблокирован до ${new Date(user.locked_until).toLocaleString('ru-RU')}`,
      });
    }

    // Аккаунт неактивен?
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Аккаунт деактивирован. Обратитесь к администратору.',
      });
    }

    // Проверяем пароль
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Увеличиваем счётчик неудачных попыток
      const attempts = user.failed_login_attempts + 1;
      let lockedUntil = null;

      if (attempts >= 5) {
        lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // блок на 30 минут
        logger.warn(`Аккаунт ${user.email} заблокирован после ${attempts} неудачных попыток`);
      }

      await pool.query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [attempts, lockedUntil, user.id]
      );

      await writeAuditLog({
        userId: user.id,
        action: 'LOGIN_FAIL',
        details: { reason: 'Неверный пароль', attempts },
        ipAddress,
        userAgent,
        success: false,
      });

      return res.status(401).json({
        success: false,
        message: attempts >= 5
          ? 'Аккаунт заблокирован на 30 минут из-за множества неудачных попыток.'
          : `Неверный email или пароль. Осталось попыток: ${5 - attempts}`,
      });
    }

    // Сбрасываем счётчик неудачных попыток
    await pool.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Генерируем токены
    const { accessToken, refreshToken } = generateTokens(user);

    // Сохраняем refresh токен в БД (хэшируем перед сохранением)
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, expiresAt, ipAddress, userAgent]
    );

    await writeAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      details: { username: user.username },
      ipAddress,
      userAgent,
    });

    logger.info(`Вход выполнен: ${user.username} (${user.email})`);

    return res.status(200).json({
      success: true,
      message: 'Вход выполнен успешно!',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role_name,
        },
      },
    });
  } catch (err) {
    logger.error('Ошибка входа:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * POST /api/auth/refresh — Обновление access токена
 */
async function refresh(req, res) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Refresh токен отсутствует' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Проверяем токен в БД
    const tokenResult = await pool.query(
      `SELECT rt.*, u.username, u.email, r.name as role_name
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE rt.token_hash = $1
         AND rt.user_id = $2
         AND rt.is_revoked = false
         AND rt.expires_at > NOW()`,
      [tokenHash, decoded.id]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Недействительный refresh токен' });
    }

    const userData = tokenResult.rows[0];
    const newAccessToken = jwt.sign(
      { id: userData.user_id, username: userData.username, email: userData.email, role: userData.role_name },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
    );

    return res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Недействительный refresh токен' });
  }
}

/**
 * POST /api/auth/logout — Выход из системы
 */
async function logout(req, res) {
  const { refreshToken } = req.body;
  const userId = req.user?.id;

  try {
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await pool.query(
        'UPDATE refresh_tokens SET is_revoked = true WHERE token_hash = $1',
        [tokenHash]
      );
    }

    await writeAuditLog({
      userId,
      action: 'LOGOUT',
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.status(200).json({ success: true, message: 'Выход выполнен успешно' });
  } catch (err) {
    logger.error('Ошибка выхода:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * GET /api/auth/me — Получение информации о текущем пользователе
 */
async function getMe(req, res) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.is_active, u.is_verified,
              u.last_login, u.created_at, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Ошибка получения профиля:', err);
    return res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = { register, login, refresh, logout, getMe };
