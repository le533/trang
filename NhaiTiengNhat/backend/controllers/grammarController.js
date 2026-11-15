const { pool } = require('../config/database');
const { getPagination } = require('../utils/pagination');

// GET /api/grammar
async function list(req, res, next) {
  const { page, limit, offset } = getPagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { level, search } = req.query;
  try {
    let where = ['g.is_deleted = 0'];
    const params = [];
    if (level && ['N5','N4','N3','N2','N1'].includes(level)) { where.push('g.level = ?'); params.push(level); }
    if (search) {
      where.push('(g.title LIKE ? OR g.form LIKE ? OR g.meaning LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    const whereSQL = 'WHERE ' + where.join(' AND ');
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM grammar_points g ${whereSQL}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.query(
      `SELECT id, title, level, form, meaning, structure, video_url FROM grammar_points g ${whereSQL} ORDER BY level, id LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    if (!rows.length) return res.json({ success: true, data: [], total, page, limit });
    const ids = rows.map(r => r.id);
    const [examples] = await pool.query(
      `SELECT * FROM grammar_examples WHERE grammar_point_id IN (?) ORDER BY grammar_point_id, sort_order`, [ids]);
    const data = rows.map(g => ({
      id: String(g.id),
      title: g.title,
      level: g.level,
      form: g.form || '',
      meaning: g.meaning,
      structure: g.structure || '',
      videoUrl: g.video_url || '',
      example: examples.find(e => e.grammar_point_id == g.id)?.japanese_text || '',
      examples: examples.filter(e => e.grammar_point_id == g.id).map(e => ({
        id: String(e.id),
        japanese: e.japanese_text,
        reading: e.reading || '',
        vi: e.meaning_vi || '',
        en: e.meaning_en || '',
      })),
    }));
    return res.json({ success: true, data, total, page, limit });
  } catch (err) { next(err); }
}

// GET /api/grammar/:id
async function getOne(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    const [rows] = await pool.query('SELECT * FROM grammar_points WHERE id=? AND is_deleted=0 LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy ngữ pháp.' });
    const g = rows[0];
    const [examples] = await pool.query('SELECT * FROM grammar_examples WHERE grammar_point_id=? ORDER BY sort_order', [id]);
    return res.json({ success: true, data: {
      id: String(g.id), title: g.title, level: g.level, form: g.form || '',
      meaning: g.meaning, structure: g.structure || '', videoUrl: g.video_url || '',
      examples: examples.map(e => ({ id: String(e.id), japanese: e.japanese_text, reading: e.reading || '', vi: e.meaning_vi || '', en: e.meaning_en || '' })),
    }});
  } catch (err) { next(err); }
}

// POST /api/grammar (admin)
async function create(req, res, next) {
  const { title, level, form, meaning, structure, videoUrl, examples } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO grammar_points (title, level, form, meaning, structure, video_url) VALUES (?,?,?,?,?,?)',
      [title.trim(), level, form?.trim() || null, meaning.trim(), structure?.trim() || null, videoUrl?.trim() || null]
    );
    const gid = r.insertId;
    for (let i = 0; i < (examples || []).length; i++) {
      const ex = examples[i];
      await conn.query('INSERT INTO grammar_examples (grammar_point_id, japanese_text, reading, meaning_vi, meaning_en, sort_order) VALUES (?,?,?,?,?,?)',
        [gid, ex.japanese, ex.reading || null, ex.vi || null, ex.en || null, i + 1]);
    }
    await conn.commit();
    return res.status(201).json({ success: true, id: gid, message: 'Thêm ngữ pháp thành công.' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { conn?.release(); }
}

// PUT /api/grammar/:id (admin)
async function update(req, res, next) {
  const id = parseInt(req.params.id, 10);
  const { title, level, form, meaning, structure, videoUrl, examples } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [result] = await conn.query(
      `UPDATE grammar_points
       SET title=?, level=?, form=?, meaning=?, structure=?, video_url=?
       WHERE id=? AND is_deleted=0`,
      [title.trim(), level, form?.trim() || null, meaning.trim(), structure?.trim() || null, videoUrl?.trim() || null, id]
    );
    if (!result.affectedRows) {
      const [existing] = await conn.query('SELECT id FROM grammar_points WHERE id=? AND is_deleted=0', [id]);
      if (!existing.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Không tìm thấy ngữ pháp.' });
      }
    }
    if (Array.isArray(examples)) {
      await conn.query('DELETE FROM grammar_examples WHERE grammar_point_id=?', [id]);
      for (let i = 0; i < examples.length; i++) {
        const ex = examples[i];
        await conn.query(
          `INSERT INTO grammar_examples
           (grammar_point_id, japanese_text, reading, meaning_vi, meaning_en, sort_order)
           VALUES (?,?,?,?,?,?)`,
          [id, ex.japanese.trim(), ex.reading?.trim() || null, ex.vi?.trim() || null, ex.en?.trim() || null, i + 1]
        );
      }
    }
    await conn.commit();
    return res.json({ success: true, message: 'Cập nhật ngữ pháp thành công.' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { conn?.release(); }
}

// DELETE /api/grammar/:id (admin)
async function remove(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    const [result] = await pool.query('UPDATE grammar_points SET is_deleted=1 WHERE id=? AND is_deleted=0', [id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Không tìm thấy ngữ pháp.' });
    return res.json({ success: true, message: 'Đã xóa ngữ pháp.' });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, create, update, remove };
