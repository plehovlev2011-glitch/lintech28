import axios from 'axios';

// Кэш для сессий (в памяти, на Vercel лучше Redis)
const sessions = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { login, password } = req.body;
    
    // 1. Авторизация в АИАС АВЕРС
    const loginResponse = await axios.post(
      'https://journal.school28-kirov.ru/auth',
      new URLSearchParams({
        l: login,
        p: password,
        s: '28'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    // 2. Получаем куки сессии
    const cookies = loginResponse.headers['set-cookie'];
    const sessionId = Math.random().toString(36).substring(2);
    
    // 3. Получаем данные пользователя
    const userData = await getUserData(cookies, login);
    
    // 4. Сохраняем сессию
    sessions.set(sessionId, {
      cookies,
      userData,
      timestamp: Date.now()
    });

    // 5. Отправляем ответ
    res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    res.status(200).json({
      success: true,
      user: {
        login,
        fullName: userData.fullName || login,
        studentId: userData.studentId,
        classId: userData.classId
      }
    });

  } catch (error) {
    console.error('Auth error:', error.message);
    res.status(401).json({ 
      success: false, 
      error: 'Неверный логин или пароль' 
    });
  }
}

async function getUserData(cookies, login) {
  try {
    // Пробуем разные методы получения данных пользователя
    const actions = [
      'GET_USER_INFO',
      'GET_STUDENT_INFO',
      'GET_STUDENT_DATA'
    ];

    for (const action of actions) {
      try {
        const response = await axios.post(
          'https://journal.school28-kirov.ru/act/',
          new URLSearchParams({ action }),
          {
            headers: {
              'Cookie': cookies,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );

        if (response.data && response.data.length > 0) {
          return {
            studentId: response.data[0].studentId || login,
            classId: response.data[0].classId || 1000,
            fullName: response.data[0].fullName || login
          };
        }
      } catch (e) {
        continue;
      }
    }

    // Если не нашли данные, возвращаем дефолтные
    return {
      studentId: login,
      classId: 1000,
      fullName: login
    };

  } catch (error) {
    throw error;
  }
}
