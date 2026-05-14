require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const logger = require('./config/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const app = express();

// Создаём папку для логов если нет
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ========================
//  БЕЗОПАСНОСТЬ (Security headers)
// ========================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
);

// ========================
//  CORS
// ========================
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ========================
//  Парсинг тела запроса
// ========================
app.use(express.json({ limit: '10kb' })); // Ограничение размера тела запроса
app.use(express.urlencoded({ extended: false }));

// ========================
//  Логирование HTTP запросов
// ========================
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.http(message.trim()) },
  })
);

// ========================
//  Общий rate limiter
// ========================
app.use('/api/', apiLimiter);

// ========================
//  МАРШРУТЫ
// ========================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Проверка работы сервера
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🟢 Сервер работает',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ========================
//  404 — маршрут не найден
// ========================
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Маршрут не найден' });
});

// ========================
//  Глобальный обработчик ошибок
// ========================
app.use((err, req, res, next) => {
  logger.error(`Необработанная ошибка: ${err.message}`, err);
  res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
});

// ========================
//  ЗАПУСК СЕРВЕРА
// ========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`🚀 Сервер запущен на порту ${PORT}`);
  logger.info(`📍 Режим: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 URL: http://localhost:${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
