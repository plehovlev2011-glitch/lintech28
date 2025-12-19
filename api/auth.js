const axios = require('axios');

// Временное хранилище сессий (в продакшене нужен Redis)
const sessions = new Map();

module.exports = async (req, res) => {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не разрешен' });
  }

  try {
    const { login, password } = req.body;
    
    console.log('Попытка входа для:', login);
    
    // 1. Пробуем авторизоваться в АИАС АВЕРС
    // Сначала получим куки (иногда нужен GET запрос сначала)
    const initResponse = await axios.get(
      'https://journal.school28-kirov.ru',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    
    // 2. Пробуем разные варианты входа
    const loginPayload = new URLSearchParams();
    loginPayload.append('l', login);
    loginPayload.append('p', password);
    
    // Иногда нужен параметр 's' - код школы
    if (login.includes('@') || login.length > 10) {
      // Вероятно, это email или длинный логин
      loginPayload.append('s', '28');
    }
    
    const loginResponse = await axios.post(
      'https://journal.school28-kirov.ru/auth',
      loginPayload.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': initResponse.headers['set-cookie'] || ''
        },
        maxRedirects: 5
      }
    );
    
    // 3. Проверяем успешность входа
    const responseText = loginResponse.data;
    const cookies = loginResponse.headers['set-cookie'];
    
    if (!cookies || responseText.includes('Неверный логин') || responseText.includes('Ошибка')) {
      throw new Error('Неверные учетные данные');
    }
    
    // 4. Генерируем сессию
    const sessionId = require('crypto').randomBytes(32).toString('hex');
    
    // 5. Пробуем получить данные пользователя
    let userData = {
      login: login,
      studentId: 4477, // По умолчанию, будет уточнено
      classId: 1000,
      fullName: login
    };
    
    // Пробуем найти studentId в куках
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    if (cookieStr.includes('ys-userId')) {
      const match = cookieStr.match(/ys-userId=[^;]+/);
      if (match) {
        const value = decodeURIComponent(match[0].split('=')[1]);
        if (value.includes('n:')) {
          userData.studentId = parseInt(value.split(':')[1]) || 4477;
        }
      }
    }
    
    // 6. Сохраняем сессию
    sessions.set(sessionId, {
      cookies: cookieStr,
      userData: userData,
      timestamp: Date.now()
    });
    
    // 7. Очищаем старые сессии (каждые 100)
    if (sessions.size > 100) {
      const now = Date.now();
      for (const [key, session] of sessions.entries()) {
        if (now - session.timestamp > 24 * 60 * 60 * 1000) { // 24 часа
          sessions.delete(key);
        }
      }
    }
    
    // 8. Отправляем ответ
    res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${24 * 60 * 60}`);
    
    res.status(200).json({
      success: true,
      user: userData,
      sessionId: sessionId
    });
    
  } catch (error) {
    console.error('Auth error:', error.message);
    
    // Более информативные ошибки
    let errorMessage = 'Ошибка входа';
    if (error.message.includes('401') || error.message.includes('Неверные')) {
      errorMessage = 'Неверный логин или пароль';
    } else if (error.message.includes('network') || error.message.includes('ECONN')) {
      errorMessage = 'Проблемы с соединением. Попробуйте позже';
    }
    
    res.status(401).json({ 
      success: false, 
      error: errorMessage 
    });
  }
};
