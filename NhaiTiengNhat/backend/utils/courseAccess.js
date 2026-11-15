async function hasCourseAccess(db, userId, courseId, role = 'user') {
  if (!courseId) return true;
  const [courses] = await db.query('SELECT price_vnd FROM courses WHERE id=? AND is_published=1 LIMIT 1', [courseId]);
  if (!courses.length) return false;
  if (Number(courses[0].price_vnd) === 0 || role === 'admin') return true;
  if (!userId) return false;
  const [subscriptions] = await db.query(
    `SELECT id FROM course_subscriptions
     WHERE user_id=? AND course_id=? AND status='active'
       AND (ends_at IS NULL OR ends_at > NOW()) LIMIT 1`,
    [userId, courseId]
  );
  return subscriptions.length > 0;
}

module.exports = { hasCourseAccess };
