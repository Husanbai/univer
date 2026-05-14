const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { register, login, refresh, logout, getMe } = require('../controllers/authController');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { authenticateToken } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

// Валидация для регистрации
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Имя пользователя должно быть от 3 до 50 символов')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Только латинские буквы, цифры и нижнее подчёркивание'),
  body('email')
    .isEmail()
    .withMessage('Введите корректный email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Пароль минимум 8 символов')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Пароль должен содержать строчную, заглавную букву и цифру'),
];

// Валидация для входа
const loginValidation = [
  body('email').isEmail().withMessage('Введите корректный email').normalizeEmail(),
  body('password').notEmpty().withMessage('Введите пароль'),
];

// Demo-режим: вход без базы данных (для демонстрации механизмов защиты)
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const DEMO_USERS = [
  { id: 'demo-uuid-001', username: 'admin_demo', email: 'admin@demo.com', role: 'admin',
    hash: '$2a$12$RVkHwSTiNcx7CgLVfONg0.oNhrZXjNVqmqCZ4m4RB9RSJLgxfSri6' }, // Admin1234
  { id: 'demo-uuid-002', username: 'user_demo', email: 'user@demo.com', role: 'user',
    hash: '$2a$12$RVkHwSTiNcx7CgLVfONg0.oNhrZXjNVqmqCZ4m4RB9RSJLgxfSri6' }, // Admin1234
];
router.post('/demo/login', loginLimiter, loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = DEMO_USERS.find(u => u.email === email);
    if (!user) return res.status(401).json({ success: false, message: 'Пользователь не найден. Используйте: admin@demo.com или user@demo.com' });
    const valid = await bcrypt.compare(password, user.hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Неверный пароль. Попробуйте: Admin1234' });
    const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_ACCESS_SECRET || 'demo_access_secret', { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET || 'demo_refresh_secret', { expiresIn: '7d' });
    res.json({ success: true, message: 'Аутентификация успешна (демо-режим)', data: { user: { id: user.id, username: user.username, email: user.email, role: user.role }, accessToken, refreshToken } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Ошибка сервера', error: err.message });
  }
});

// Маршруты
router.post('/register', registerLimiter, registerValidation, handleValidationErrors, register);
router.post('/login', loginLimiter, loginValidation, handleValidationErrors, login);
router.post('/refresh', refresh);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getMe);

module.exports = router;
