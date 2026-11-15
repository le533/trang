const { pool } = require('../config/database');
const { refreshLearningStats } = require('../utils/learningStats');
const { getPagination } = require('../utils/pagination');

// GET /api/exercises
async function list(req, res, next) {
  const { page, limit, offset } = getPagination(req.query, { defaultLimit: 12, maxLimit: 50 });
  const { level, search, topic } = req.query;
  try {
    let where = ['e.is_deleted = 0'];
    const params = [];
    if (level && ['N5','N4','N3','N2','N1'].includes(level)) { where.push('e.level = ?'); params.push(level); }
    if (topic) { where.push('e.topic = ?'); params.push(topic); }
    if (search) { where.push('(e.title LIKE ? OR e.description LIKE ?)'); const q = `%${search}%`; params.push(q, q); }
    const whereSQL = 'WHERE ' + where.join(' AND ');
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM exercises e ${whereSQL}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.query(
      `SELECT id, title, level, topic, question_count, description FROM exercises e ${whereSQL} ORDER BY level, id LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    let attemptsMap = {};
    if (req.user) {
      const ids = rows.map(r => r.id);
      if (ids.length) {
        const [attempts] = await pool.query(
          `SELECT exercise_id, MAX(score) AS best_score, COUNT(*) AS attempt_count
           FROM exercise_attempts WHERE user_id=? AND exercise_id IN (?) AND completed_at IS NOT NULL GROUP BY exercise_id`,
          [req.user.id, ids]);
        attempts.forEach(a => { attemptsMap[a.exercise_id] = { bestScore: parseFloat(a.best_score), attemptCount: a.attempt_count }; });
      }
    }

    const data = rows.map(e => ({
      id: String(e.id), title: e.title, level: e.level, topic: e.topic || '',
      questionCount: e.question_count, description: e.description,
      bestScore: attemptsMap[e.id]?.bestScore ?? null,
      attemptCount: attemptsMap[e.id]?.attemptCount ?? 0,
    }));
    return res.json({ success: true, data, total, page, limit });
  } catch (err) { next(err); }
}

// GET /api/exercises/:id  (with questions + choices)
async function getOne(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    const [rows] = await pool.query('SELECT * FROM exercises WHERE id=? AND is_deleted=0 LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy bài tập.' });
    const e = rows[0];
    const [questions] = await pool.query('SELECT * FROM exercise_questions WHERE exercise_id=? ORDER BY sort_order', [id]);
    const qids = questions.map(q => q.id);
    let choices = [];
    if (qids.length) {
      [choices] = await pool.query('SELECT * FROM exercise_choices WHERE question_id IN (?) ORDER BY question_id, sort_order', [qids]);
    }
    return res.json({ success: true, data: {
      id: String(e.id), title: e.title, level: e.level, topic: e.topic || '',
      questionCount: e.question_count, description: e.description,
      questions: questions.map(q => ({
        id: String(q.id), text: q.question_text, type: q.question_type, explanation: q.explanation || '',
        choices: q.question_type === 'short_answer' ? [] : choices.filter(c => c.question_id == q.id).map(c => ({
          id: String(c.id), text: c.choice_text, sortOrder: c.sort_order,
          // is_correct only exposed for review (after submission), not during quiz
        })),
      })),
    }});
  } catch (err) { next(err); }
}

// POST /api/exercises/:id/submit (auth required)
async function submit(req, res, next) {
  const exerciseId = parseInt(req.params.id, 10);
  const { answers } = req.body; // [{questionId, choiceId?, answerText?}]
  const userId = req.user.id;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [exRows] = await conn.query(
      'SELECT id FROM exercises WHERE id=? AND is_deleted=0 LIMIT 1', [exerciseId]
    );
    if (!exRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Bài tập không tồn tại.' });
    }

    const [questions] = await conn.query(
      'SELECT * FROM exercise_questions WHERE exercise_id=? ORDER BY sort_order', [exerciseId]
    );
    if (!questions.length) {
      await conn.rollback();
      return res.status(422).json({ success: false, message: 'Bài tập chưa có câu hỏi.' });
    }

    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
    const [lastAttempt] = await conn.query(
      'SELECT MAX(attempt_number) AS max_num FROM exercise_attempts WHERE user_id=? AND exercise_id=?', [userId, exerciseId]);
    const attemptNumber = (lastAttempt[0].max_num || 0) + 1;

    const qids = questions.map(q => q.id);
    const [choices] = await conn.query(
      'SELECT * FROM exercise_choices WHERE question_id IN (?) ORDER BY question_id, sort_order', [qids]
    );
    const answersByQuestion = new Map();
    for (const answer of answers) {
      if (!answer || typeof answer !== 'object') {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Câu trả lời không hợp lệ.' });
      }
      const questionId = Number(answer.questionId);
      if (!questions.some(question => question.id === questionId) || answersByQuestion.has(questionId)) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Câu trả lời chứa câu hỏi không hợp lệ hoặc bị lặp.' });
      }
      if (answer.answerText !== undefined && String(answer.answerText).length > 2000) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Câu trả lời quá dài.' });
      }
      answersByQuestion.set(questionId, answer);
    }

    const [attemptResult] = await conn.query(
      'INSERT INTO exercise_attempts (user_id, exercise_id, attempt_number, total_questions, started_at) VALUES (?,?,?,?,NOW())',
      [userId, exerciseId, attemptNumber, questions.length]
    );
    const attemptId = attemptResult.insertId;

    let correctCount = 0;
    const results = [];
    for (const question of questions) {
      const qid = question.id;
      const answer = answersByQuestion.get(qid);
      let isCorrect = false;
      let selectedChoiceId = null;
      const answerText = answer?.answerText == null ? null : String(answer.answerText).trim();
      if (answer?.choiceId !== undefined && answer.choiceId !== null && answer.choiceId !== '') {
        selectedChoiceId = Number(answer.choiceId);
        const selectedChoice = choices.find(c => c.id === selectedChoiceId && c.question_id === qid);
        if (!selectedChoice) {
          await conn.rollback();
          return res.status(400).json({ success: false, message: 'Lựa chọn không thuộc câu hỏi này.' });
        }
        isCorrect = Boolean(selectedChoice.is_correct);
      } else if (answerText && ['true_false', 'short_answer'].includes(question.question_type)) {
        const normalizedAnswer = answerText.normalize('NFKC').trim().toLocaleLowerCase();
        isCorrect = choices.some(choice =>
          choice.question_id === qid &&
          choice.is_correct &&
          choice.choice_text.normalize('NFKC').trim().toLocaleLowerCase() === normalizedAnswer
        );
      }
      if (isCorrect) correctCount++;
      await conn.query(
        'INSERT INTO exercise_attempt_answers (attempt_id, question_id, selected_choice_id, answer_text, is_correct) VALUES (?,?,?,?,?)',
        [attemptId, qid, selectedChoiceId, answerText, isCorrect ? 1 : 0]
      );
      const correctChoice = choices.find(c => c.question_id == qid && Boolean(c.is_correct));
      results.push({
        questionId: String(qid),
        isCorrect,
        correctChoiceId: correctChoice ? String(correctChoice.id) : null,
        correctAnswer: correctChoice?.choice_text || '',
        explanation: question.explanation || '',
      });
    }

    const score = questions.length ? (correctCount / questions.length) * 100 : 0;
    await conn.query('UPDATE exercise_attempts SET score=?, correct_count=?, completed_at=NOW() WHERE id=?',
      [score.toFixed(2), correctCount, attemptId]);

    // update accuracy in learning stats
    await refreshLearningStats(conn, userId);

    await conn.commit();
    return res.json({
      success: true, attemptId, attemptNumber, score: parseFloat(score.toFixed(2)),
      correctCount, totalQuestions: questions.length, results,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { conn?.release(); }
}

// GET /api/exercises/:id/attempts (auth)
async function getAttempts(req, res, next) {
  const exerciseId = parseInt(req.params.id, 10);
  try {
    const [rows] = await pool.query(
      `SELECT id, attempt_number, score, correct_count, total_questions, started_at, completed_at
       FROM exercise_attempts WHERE user_id=? AND exercise_id=? ORDER BY attempt_number DESC LIMIT 20`,
      [req.user.id, exerciseId]
    );
    return res.json({ success: true, data: rows.map(a => ({
      id: String(a.id), attemptNumber: a.attempt_number, score: parseFloat(a.score),
      correctCount: a.correct_count, totalQuestions: a.total_questions,
      startedAt: a.started_at, completedAt: a.completed_at,
    }))});
  } catch (err) { next(err); }
}

// POST /api/exercises (admin)
async function create(req, res, next) {
  const { title, level, topic, description, questions } = req.body;
  let conn;
  try {
    if (!Array.isArray(questions) || !questions.length) {
      return res.status(422).json({ success: false, message: 'Bài tập cần có ít nhất một câu hỏi.' });
    }
    for (const question of questions) {
      if (!question.text?.trim() || !['multiple_choice', 'short_answer', 'true_false'].includes(question.type || 'multiple_choice')) {
        return res.status(422).json({ success: false, message: 'Nội dung hoặc dạng câu hỏi không hợp lệ.' });
      }
      if (!Array.isArray(question.choices) || !question.choices.length ||
          ((question.type || 'multiple_choice') === 'multiple_choice' && question.choices.length < 2) ||
          question.choices.filter(choice => choice.isCorrect).length !== 1 ||
          question.choices.some(choice => !choice.text?.trim())) {
        return res.status(422).json({ success: false, message: 'Mỗi câu hỏi cần các lựa chọn hợp lệ và đúng một đáp án đúng.' });
      }
    }
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [r] = await conn.query('INSERT INTO exercises (title, level, topic, description, question_count) VALUES (?,?,?,?,?)',
      [title.trim(), level, topic?.trim() || null, description.trim(), (questions || []).length]);
    const eid = r.insertId;
    for (let i = 0; i < (questions || []).length; i++) {
      const q = questions[i];
      const [qr] = await conn.query('INSERT INTO exercise_questions (exercise_id, question_text, question_type, sort_order, explanation) VALUES (?,?,?,?,?)',
        [eid, q.text, q.type || 'multiple_choice', i + 1, q.explanation || null]);
      const qid = qr.insertId;
      for (let j = 0; j < (q.choices || []).length; j++) {
        const c = q.choices[j];
        await conn.query('INSERT INTO exercise_choices (question_id, choice_text, is_correct, sort_order) VALUES (?,?,?,?)',
          [qid, c.text, c.isCorrect ? 1 : 0, j + 1]);
      }
    }
    await conn.commit();
    return res.status(201).json({ success: true, id: eid, message: 'Thêm bài tập thành công.' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { conn?.release(); }
}

// DELETE /api/exercises/:id (admin)
async function remove(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('UPDATE exercises SET is_deleted=1 WHERE id=?', [id]);
    return res.json({ success: true, message: 'Đã xóa bài tập.' });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, submit, getAttempts, create, remove };
