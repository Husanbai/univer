const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  changePassword,
  getAuditLogs,
} = require('../controllers/userController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

// Все маршруты требуют авторизации
router.use(authenticateToken);

// Список пользователей — только admin
router.get('/', requireRole('admin'), getAllUsers);

// Аудит-логи — только admin
router.get('/audit-logs', requireRole('admin'), getAuditLogs);

// Профиль по ID
router.get('/:id', getUserById);

// Смена пароля текущим пользователем
router.put(
  '/me/password',
  [
    body('currentPassword').notEmpty().withMessage('Введите текущий пароль'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Новый пароль минимум 8 символов')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Пароль должен содержать строчную, заглавную букву и цифру'),
  ],
  handleValidationErrors,
  changePassword
);

// Изменить роль — только admin
router.put(
  '/:id/role',
  requireRole('admin'),
  [body('role').isIn(['admin', 'user', 'moderator']).withMessage('Недопустимая роль')],
  handleValidationErrors,
  updateUserRole
);

// Изменить статус — только admin
router.put(
  '/:id/status',
  requireRole('admin'),
  [body('is_active').isBoolean().withMessage('Укажите true или false')],
  handleValidationErrors,
  updateUserStatus
);

module.exports = router;
