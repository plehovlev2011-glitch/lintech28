const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mysql = require('mysql2/promise'); // или sqlite3

const app = express();
const PORT = 3000;

// База данных (SQLite для простоты)
const db = require('better-sqlite3')('diary.db');

// Инициализация БД
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE,
    password_hash TEXT,
    student_id INTEGER,
    class_id INTEGER,
    full_name TEXT,
    last_sync TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS cache (
    user_id INTEGER,
    data_type TEXT,
    data_json TEXT,
    updated TIMESTAMP,
    PRIMARY KEY (user_id, data_type)
  );
`);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: 'school28-secret-key',
  resave: false,
  saveUninitialized: true
}));

// Конфигурация АИАС АВЕРС
const AVERS_CONFIG = {
  baseUrl: 'https://journal.school28-kirov.ru',
  endpoints: {
    login: '/auth', // предположительный URL входа
    api: '/act/'
  }
};

// 1. Авторизация в АИАС АВЕРС
app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    
    // Эмулируем вход в старую систему
    const loginResponse = await axios.post(AVERS_CONFIG.endpoints.login, {
      l: login,
      p: password,
      s: '28' // код школы
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    // Извлекаем куки сессии
    const sessionCookies = loginResponse.headers['set-cookie'];
    
    // Пробуем получить данные пользователя
    const userData = await axios.post(AVERS_CONFIG.baseUrl + AVERS_CONFIG.endpoints.api, 
      new URLSearchParams({ action: 'GET_USER_INFO' }),
      {
        headers: {
          'Cookie': sessionCookies,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Сохраняем пользователя в БД
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO users (login, password_hash, student_id, class_id, full_name, last_sync)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(login, password, userData.studentId, userData.classId, userData.fullName);
    
    // Сохраняем сессию
    req.session.userId = login;
    req.session.aversCookies = sessionCookies;
    req.session.studentData = userData;
    
    res.json({
      success: true,
      user: {
        login: login,
        fullName: userData.fullName,
        classId: userData.classId,
        studentId: userData.studentId
      }
    });
    
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
  }
});

// 2. Прокси запросов к АИАС
app.post('/api/avers/:action', async (req, res) => {
  try {
    if (!req.session.aversCookies) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const { action } = req.params;
    const params = req.body;
    
    // Проверяем кэш
    const cached = db.prepare(
      'SELECT data_json FROM cache WHERE user_id = ? AND data_type = ? AND updated > datetime("now", "-1 hour")'
    ).get(req.session.userId, action);
    
    if (cached) {
      return res.json(JSON.parse(cached.data_json));
    }
    
    // Запрашиваем у АИАС
    const response = await axios.post(
      AVERS_CONFIG.baseUrl + AVERS_CONFIG.endpoints.api,
      new URLSearchParams({ action, ...params }),
      {
        headers: {
          'Cookie': req.session.aversCookies,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    
    // Кэшируем результат
    const cacheStmt = db.prepare(`
      INSERT OR REPLACE INTO cache (user_id, data_type, data_json, updated)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    cacheStmt.run(req.session.userId, action, JSON.stringify(response.data));
    
    res.json(response.data);
    
  } catch (error) {
    console.error('API error:', error.message);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// 3. Получение данных с кэшированием
app.get('/api/data/:type', async (req, res) => {
  const userId = req.session.userId;
  const { type } = req.params;
  
  if (!userId) return res.status(401).json({ error: 'Не авторизован' });
  
  // Получаем данные пользователя
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(userId);
  
  // Определяем action для типа данных
  const actionMap = {
    marks: 'GET_STUDENT_MARKS',
    diary: 'GET_STUDENT_DIARY',
    subjects: 'GET_STUDENT_SUBJECTS',
    messages: 'GET_STUDENT_MESSAGES',
    timetable: 'GET_TIMES',
    attendance: 'GET_STUDENT_ATTENDANCE'
  };
  
  const action = actionMap[type];
  if (!action) return res.status(400).json({ error: 'Неверный тип данных' });
  
  // Параметры для запроса
  const params = {
    student: user.student_id,
    uchYear: new Date().getFullYear(),
    cls: user.class_id
  };
  
  // Используем прокси
  const proxyResponse = await axios.post(`http://localhost:${PORT}/api/avers/${action}`, 
    params,
    { headers: { 'Cookie': req.sessionID } }
  );
  
  res.json(proxyResponse.data);
});

// 4. Статические файлы
app.use(express.static('public'));

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
  console.log(`📚 Новый дневник доступен по этому адресу`);
});
