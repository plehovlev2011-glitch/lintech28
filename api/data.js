const axios = require('axios');

// Временный кэш
const cache = new Map();

module.exports = async (req, res) => {
  // CORS заголовки
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Метод не разрешен' });
  }

  try {
    const { type, studentId = 4477, classId = 1000 } = req.query;
    const sessionId = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
    
    if (!sessionId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    // Проверяем кэш
    const cacheKey = `${type}_${studentId}_${classId}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 минут
      return res.json(cached.data);
    }
    
    const year = new Date().getFullYear();
    let data;
    
    switch (type) {
      case 'marks':
        data = await getStudentMarks(studentId, classId, year);
        break;
      case 'subjects':
        data = await getStudentSubjects(studentId, classId, year);
        break;
      case 'messages':
        data = await getStudentMessages(studentId);
        break;
      case 'timetable':
        data = await getTimetable(classId, year);
        break;
      case 'info':
        data = await getStudentInfo(studentId);
        break;
      default:
        return res.status(400).json({ error: 'Неверный тип данных' });
    }
    
    // Кэшируем
    cache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    // Очистка старого кэша
    if (cache.size > 100) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > 30 * 60 * 1000) { // 30 минут
          cache.delete(key);
        }
      }
    }
    
    res.json(data);
    
  } catch (error) {
    console.error('Data error:', error.message);
    res.status(500).json({ 
      error: 'Ошибка получения данных',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

async function getStudentMarks(studentId, classId, year) {
  try {
    const response = await axios.post(
      'https://journal.school28-kirov.ru/act/',
      new URLSearchParams({
        action: 'GET_STUDENT_MARKS',
        student: studentId,
        uchYear: year,
        cls: classId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 10000
      }
    );
    
    return response.data || [];
  } catch (error) {
    console.error('Marks error:', error.message);
    return [];
  }
}

async function getStudentSubjects(studentId, classId, year) {
  try {
    const response = await axios.post(
      'https://journal.school28-kirov.ru/act/',
      new URLSearchParams({
        action: 'GET_STUDENT_SUBJECTS',
        student: studentId,
        uchYear: year,
        cls: classId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    
    return response.data || [];
  } catch (error) {
    console.error('Subjects error:', error.message);
    return [];
  }
}

async function getTimetable(classId, year) {
  try {
    const response = await axios.post(
      'https://journal.school28-kirov.ru/act/',
      new URLSearchParams({
        action: 'GET_TIMES',
        cls: classId,
        uchYear: year
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    
    return response.data || [];
  } catch (error) {
    console.error('Timetable error:', error.message);
    return [];
  }
}

async function getStudentMessages(studentId) {
  try {
    const response = await axios.post(
      'https://journal.school28-kirov.ru/act/',
      new URLSearchParams({
        action: 'GET_STUDENT_MESSAGES',
        student: studentId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    
    return response.data || [];
  } catch (error) {
    console.error('Messages error:', error.message);
    return [];
  }
}

async function getStudentInfo(studentId) {
  try {
    const response = await axios.post(
      'https://journal.school28-kirov.ru/act/',
      new URLSearchParams({
        action: 'GET_STUDENT_INFO',
        student: studentId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    
    return response.data || {};
  } catch (error) {
    console.error('Student info error:', error.message);
    return {};
  }
}
