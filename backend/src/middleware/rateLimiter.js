const rateLimit = require('express-rate-limit');

/**
 * Лимит для попыток входа — защита от брутфорса
 * Максимум 5 попыток за 15 минут
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Слишком много попыток входа. Подождите 15 минут.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + ':' + (req.body?.email || ''),
});

/**
 * Лимит для регистрации
 * Максимум 3 регистрации в час с одного IP
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: 'Слишком много регистраций с вашего IP. Попробуйте через час.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Общий лимит для всех API запросов
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Слишком много запросов. Попробуйте позже.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, registerLimiter, apiLimiter };
