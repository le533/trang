function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

async function refreshLearningStats(db, userId) {
  const [[todayRow]] = await db.query(
    "SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS today"
  );
  const [activityRows] = await db.query(
    `SELECT activity_date FROM (
       SELECT DATE_FORMAT(updated_at, '%Y-%m-%d') AS activity_date
       FROM lesson_progress
       WHERE user_id=? AND status IN ('in_progress', 'completed')
       UNION
       SELECT DATE_FORMAT(completed_at, '%Y-%m-%d') AS activity_date
       FROM exercise_attempts
       WHERE user_id=? AND completed_at IS NOT NULL
     ) activity
     ORDER BY activity_date DESC LIMIT 100`,
    [userId, userId]
  );
  const activeDates = new Set(activityRows.map(row => row.activity_date));
  let date = activeDates.has(todayRow.today)
    ? todayRow.today
    : activeDates.has(shiftDate(todayRow.today, -1)) ? shiftDate(todayRow.today, -1) : null;
  let streakDays = 0;
  while (date && activeDates.has(date)) {
    streakDays++;
    date = shiftDate(date, -1);
  }

  const [[totals]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM lesson_progress WHERE user_id=? AND status='completed') AS completed_lessons,
       COALESCE((SELECT AVG(score) FROM exercise_attempts WHERE user_id=? AND completed_at IS NOT NULL), 0) AS accuracy`,
    [userId, userId]
  );
  await db.query(
    `UPDATE user_learning_stats
     SET completed_lessons=?, accuracy=?, streak_days=?, last_active_at=NOW()
     WHERE user_id=?`,
    [totals.completed_lessons, totals.accuracy, streakDays, userId]
  );
}

module.exports = { refreshLearningStats };
