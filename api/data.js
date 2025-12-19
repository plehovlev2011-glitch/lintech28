import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 }); // 5 минут кэш

export default async function handler(req, res) {
  const { type, studentId, classId } = req.query;
  const sessionId = req.cookies?.session;

  if (!sessionId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }

  // В реальном приложении здесь проверка сессии
  const cacheKey = `${type}_${studentId}_${classId}`;
  
  // Проверяем кэш
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    let data;
    const year = new Date().getFullYear();
    
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
      default:
        return res.status(400).json({ error: 'Неверный тип данных' });
    }

    // Кэшируем
    cache.set(cacheKey, data);
    
    res.json(data);
    
  } catch (error) {
    console.error('Data error:', error.message);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
}

async function getStudentMarks(studentId, classId, year) {
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
      }
    }
  );
  
  return response.data || [];
}
