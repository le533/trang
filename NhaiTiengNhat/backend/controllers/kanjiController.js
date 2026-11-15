const { pool } = require('../config/database');
const { getPagination } = require('../utils/pagination');

async function syncKanjiDetails(conn, kanjiId, { kun, on, radicals }) {
  for (const [type, readings] of [['kun', kun], ['on', on]]) {
    if (Array.isArray(readings)) {
      await conn.query('DELETE FROM kanji_readings WHERE kanji_id=? AND reading_type=?', [kanjiId, type]);
      for (const [index, reading] of readings.entries()) {
        await conn.query(
          'INSERT INTO kanji_readings (kanji_id, reading_type, reading, sort_order) VALUES (?,?,?,?)',
          [kanjiId, type, reading.trim(), index + 1]
        );
      }
    }
  }
  if (Array.isArray(radicals)) {
    await conn.query('DELETE FROM kanji_radicals WHERE kanji_id=?', [kanjiId]);
    for (const radical of new Set(radicals.map(value => value.trim()).filter(Boolean))) {
      await conn.query('INSERT INTO radicals (`character`) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [radical]);
      const [rows] = await conn.query('SELECT id FROM radicals WHERE `character`=?', [radical]);
      await conn.query('INSERT IGNORE INTO kanji_radicals (kanji_id, radical_id) VALUES (?,?)', [kanjiId, rows[0].id]);
    }
  }
}

// GET /api/kanji
async function list(req, res, next) {
  const { page, limit, offset } = getPagination(req.query, { defaultLimit: 48, maxLimit: 200 });
  const { level, search, strokes, radical } = req.query;
  try {
    let where = ['k.is_deleted = 0'];
    const params = [];
    if (level && ['N5','N4','N3','N2','N1'].includes(level)) { where.push('k.jlpt_level = ?'); params.push(level); }
    if (strokes) { where.push('k.stroke_count = ?'); params.push(Number(strokes)); }
    if (radical) {
      where.push('EXISTS(SELECT 1 FROM kanji_radicals kr JOIN radicals r ON kr.radical_id=r.id WHERE kr.kanji_id=k.id AND r.`character`=?)');
      params.push(radical);
    }
    if (search) {
      where.push('(k.character LIKE ? OR k.meaning LIKE ? OR k.han_viet LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    const whereSQL = 'WHERE ' + where.join(' AND ');
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM kanji k ${whereSQL}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.query(
      `SELECT k.id, k.\`character\`, k.han_viet, k.meaning, k.jlpt_level, k.stroke_count
       FROM kanji k ${whereSQL} ORDER BY k.jlpt_level, k.stroke_count LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    if (!rows.length) return res.json({ success: true, data: [], total, page, limit });
    const ids = rows.map(r => r.id);
    const [readings] = await pool.query(
      `SELECT kanji_id, reading_type, reading FROM kanji_readings WHERE kanji_id IN (?) ORDER BY kanji_id, reading_type, sort_order`, [ids]);
    const [radicals] = await pool.query(
      `SELECT kr.kanji_id, r.\`character\` FROM kanji_radicals kr JOIN radicals r ON kr.radical_id=r.id WHERE kr.kanji_id IN (?)`, [ids]);
    const [vocabs] = await pool.query(
      `SELECT kv.kanji_id, v.id AS vid, v.word, v.reading, vm.meaning
       FROM kanji_vocabulary kv JOIN vocabulary v ON kv.vocabulary_id=v.id
       LEFT JOIN vocabulary_meanings vm ON vm.vocabulary_id=v.id AND vm.language_code='vi' AND vm.sort_order=1
       WHERE kv.kanji_id IN (?) AND v.is_deleted=0 LIMIT 500`, [ids]);

    const data = rows.map(k => ({
      id: String(k.id),
      kanji: k.character,
      hanViet: k.han_viet || '',
      meaning: k.meaning,
      jlpt: k.jlpt_level,
      strokes: k.stroke_count,
      kun: readings.filter(r => r.kanji_id == k.id && r.reading_type === 'kun').map(r => r.reading),
      on: readings.filter(r => r.kanji_id == k.id && r.reading_type === 'on').map(r => r.reading),
      radicals: radicals.filter(r => r.kanji_id == k.id).map(r => r.character),
      vocabulary: vocabs.filter(v => v.kanji_id == k.id).map(v => ({ id: String(v.vid), word: v.word, reading: v.reading, meaning: v.meaning || '' })),
    }));
    return res.json({ success: true, data, total, page, limit });
  } catch (err) { next(err); }
}

// GET /api/kanji/:id
async function getOne(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    const [rows] = await pool.query('SELECT * FROM kanji WHERE id=? AND is_deleted=0 LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy Kanji.' });
    const k = rows[0];
    const [readings] = await pool.query('SELECT * FROM kanji_readings WHERE kanji_id=? ORDER BY reading_type, sort_order', [id]);
    const [radicals] = await pool.query('SELECT r.`character` FROM kanji_radicals kr JOIN radicals r ON kr.radical_id=r.id WHERE kr.kanji_id=?', [id]);
    const [vocabs] = await pool.query(
      `SELECT v.id, v.word, v.reading, vm.meaning FROM kanji_vocabulary kv
       JOIN vocabulary v ON kv.vocabulary_id=v.id
       LEFT JOIN vocabulary_meanings vm ON vm.vocabulary_id=v.id AND vm.language_code='vi' AND vm.sort_order=1
       WHERE kv.kanji_id=? AND v.is_deleted=0`, [id]);
    return res.json({ success: true, data: {
      id: String(k.id), kanji: k.character, hanViet: k.han_viet || '', meaning: k.meaning,
      jlpt: k.jlpt_level, strokes: k.stroke_count,
      kun: readings.filter(r => r.reading_type === 'kun').map(r => r.reading),
      on: readings.filter(r => r.reading_type === 'on').map(r => r.reading),
      radicals: radicals.map(r => r.character),
      vocabulary: vocabs.map(v => ({ id: String(v.id), word: v.word, reading: v.reading, meaning: v.meaning || '' })),
    }});
  } catch (err) { next(err); }
}

// GET /api/kanji/radicals (list all unique radicals)
async function listRadicals(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT DISTINCT r.character FROM radicals r ORDER BY r.character');
    return res.json({ success: true, data: rows.map(r => r.character) });
  } catch (err) { next(err); }
}

// POST /api/kanji (admin)
async function create(req, res, next) {
  const { character, hanViet, meaning, jlpt, strokes, kun, on: onReadings, radicals } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO kanji (`character`, han_viet, meaning, jlpt_level, stroke_count) VALUES (?,?,?,?,?)',
      [character.trim(), hanViet?.trim() || null, meaning.trim(), jlpt, parseInt(strokes, 10)]
    );
    const kid = r.insertId;
    await syncKanjiDetails(conn, kid, { kun, on: onReadings, radicals });
    await conn.commit();
    return res.status(201).json({ success: true, id: kid, message: 'Thêm Kanji thành công.' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { conn?.release(); }
}

// PUT /api/kanji/:id (admin)
async function update(req, res, next) {
  const id = parseInt(req.params.id, 10);
  const { character, hanViet, meaning, jlpt, strokes, kun, on: onReadings, radicals } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [result] = await conn.query(
      'UPDATE kanji SET `character`=?, han_viet=?, meaning=?, jlpt_level=?, stroke_count=? WHERE id=? AND is_deleted=0',
      [character.trim(), hanViet?.trim() || null, meaning.trim(), jlpt, Number(strokes), id]
    );
    if (!result.affectedRows) {
      const [existing] = await conn.query('SELECT id FROM kanji WHERE id=? AND is_deleted=0', [id]);
      if (!existing.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Không tìm thấy Kanji.' });
      }
    }
    await syncKanjiDetails(conn, id, { kun, on: onReadings, radicals });
    await conn.commit();
    return res.json({ success: true, message: 'Cập nhật Kanji thành công.' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { conn?.release(); }
}

// DELETE /api/kanji/:id (admin)
async function remove(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    const [result] = await pool.query('UPDATE kanji SET is_deleted=1 WHERE id=? AND is_deleted=0', [id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Không tìm thấy Kanji.' });
    return res.json({ success: true, message: 'Đã xóa Kanji.' });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, listRadicals, create, update, remove };
