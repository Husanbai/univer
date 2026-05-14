# Система аутентификации и авторизации с защитой данных в PostgreSQL

> **Дипломный проект** — Разработка системы аутентификации и авторизации пользователей с защитой данных  
> Специальность: Информационная безопасность

## 🏗️ Архитектура проекта

```
univer/
├── backend/                  # Node.js + Express API
│   ├── src/
│   │   ├── config/           # Настройки БД и логгера
│   │   ├── controllers/      # Логика (auth, users)
│   │   ├── database/         # SQL схема, аудит-логи
│   │   ├── middleware/        # JWT, RBAC, Rate Limiter
│   │   ├── routes/           # Маршруты API
│   │   └── server.js         # Точка входа
│   └── package.json
├── frontend/                 # React приложение
│   ├── src/
│   │   ├── api/              # Axios + перехватчики
│   │   ├── context/          # AuthContext (состояние)
│   │   └── pages/            # Login, Register, Dashboard
│   └── package.json
└── docker-compose.yml        # Docker конфигурация
```

## 🔐 Механизмы безопасности

| Механизм | Реализация |
|---|---|
| Хэширование паролей | bcrypt (12 раундов) |
| Аутентификация | JWT Access (15 мин) + Refresh (7 дней) |
| Авторизация | RBAC — роли: admin, moderator, user |
| Защита от брутфорса | Rate Limiting + блокировка аккаунта (5 попыток) |
| SQL инъекции | Параметризованные запросы (pg) |
| XSS / CSRF | Helmet.js заголовки безопасности |
| Аудит | Логирование всех действий в PostgreSQL |
| Размер запроса | Ограничение 10kb |
| CORS | Настроенный список разрешённых источников |

## 🚀 Быстрый запуск

### Вариант 1 — Вручную (рекомендуется для разработки)

**1. Запустите PostgreSQL и создайте БД:**
```bash
psql -U postgres
CREATE DATABASE auth_system;
\q
```

**2. Настройте backend:**
```bash
cd backend
cp .env.example .env
# Отредактируйте .env — укажите пароль от PostgreSQL
npm install
npm run db:init    # Создаст таблицы и роли
npm run dev        # Запуск на http://localhost:5000
```

**3. Запустите frontend:**
```bash
cd frontend
npm install
npm start          # Запуск на http://localhost:3000
```

### Вариант 2 — Docker Compose

```bash
docker-compose up --build
```

Откройте: http://localhost:3000

## 📡 API Endpoints

### Аутентификация
| Метод | URL | Описание |
|---|---|---|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/refresh` | Обновление токена |
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/me` | Текущий пользователь |

### Пользователи
| Метод | URL | Доступ |
|---|---|---|
| GET | `/api/users` | admin |
| GET | `/api/users/:id` | owner / admin |
| PUT | `/api/users/:id/role` | admin |
| PUT | `/api/users/:id/status` | admin |
| PUT | `/api/users/me/password` | авторизован |
| GET | `/api/users/audit-logs` | admin |

## 🗄️ Структура базы данных

- **users** — пользователи (хэш пароля, блокировки, попытки входа)
- **roles** — роли (admin, moderator, user)
- **refresh_tokens** — хэши refresh токенов с привязкой к IP
- **audit_logs** — полный журнал всех действий

## 🛡️ Особенности защиты данных

1. **Пароли** никогда не хранятся в открытом виде — только bcrypt хэш
2. **Refresh токены** хранятся в виде SHA-256 хэша
3. **Аккаунт блокируется** на 30 минут после 5 неудачных попыток входа
4. **Все действия** записываются в аудит-лог с IP и User-Agent
5. **SQL инъекции** невозможны — используются только параметризованные запросы
6. **JWT токены** имеют короткий срок жизни (15 минут) с возможностью обновления
