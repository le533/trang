const { pool } = require('../config/database');
const { getPagination } = require('../utils/pagination');

async function insertVocabularyDetails(conn, vocabularyId, fields) {
  if (Array.isArray(fields.meaning_vi)) {
    for (const [index, meaning] of fields.meaning_vi.entries()) {
      await conn.query(
        'INSERT INTO vocabulary_meanings (vocabulary_id, language_code, meaning, sort_order) VALUES (?,?,?,?)',
        [vocabularyId, 'vi', meaning.trim(), index + 1]
      );
    }
  }
  if (Array.isArray(fields.meaning_en)) {
    for (const [index, meaning] of fields.meaning_en.entries()) {
      await conn.query(
        'INSERT INTO vocabulary_meanings (vocabulary_id, language_code, meaning, sort_order) VALUES (?,?,?,?)',
        [vocabularyId, 'en', meaning.trim(), index + 1]
      );
    }
  }
  if (Array.isArray(fields.part_of_speech)) {
    for (const [index, item] of fields.part_of_speech.entries()) {
      const code = Array.isArray(fields.part_of_speech_codes) ? fields.part_of_speech_codes[index] : null;
      await conn.query(
        'INSERT INTO vocabulary_parts_of_speech (vocabulary_id, code, label) VALUES (?,?,?)',
        [vocabularyId, code || null, String(item).trim()]
      );
    }
  }
  if (Array.isArray(fields.examples)) {
    for (const example of fields.examples) {
      await conn.query(
        `INSERT INTO vocabulary_examples
         (vocabulary_id, japanese_text, furigana, meaning_vi, meaning_en, tatoeba_id)
         VALUES (?,?,?,?,?,?)`,
        [vocabularyId, example.ja.trim(), example.furigana?.trim() || null,
          example.vi?.trim() || null, example.en?.trim() || null, example.tatoeba_id || null]
      );
    }
  }
  for (const [field, formType] of [['other_forms', 'other_form'], ['other_readings', 'other_reading']]) {
    if (!Array.isArray(fields[field])) continue;
    for (const value of fields[field]) {
      await conn.query(
        'INSERT INTO vocabulary_forms (vocabulary_id, form_type, value) VALUES (?,?,?)',
        [vocabularyId, formType, value.trim()]
      );
    }
  }
}

// GET /api/vocabulary
async function list(req, res, next) {
  const { page, limit, offset } = getPagination(req.query, { defaultLimit: 24, maxLimit: 100 });
  const { level, search, type } = req.query;
  try {
    let where = ['v.is_deleted = 0'];
    const params = [];
    if (level && ['N5','N4','N3','N2','N1'].includes(level)) {
      where.push('v.level = ?'); params.push(level);
    }
    if (search) {
      where.push(`(v.word LIKE ? OR v.reading LIKE ? OR v.romaji LIKE ? OR
        EXISTS (SELECT 1 FROM vocabulary_meanings vm WHERE vm.vocabulary_id=v.id AND vm.meaning LIKE ?))`);
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    if (type) {
      where.push('EXISTS (SELECT 1 FROM vocabulary_parts_of_speech vp WHERE vp.vocabulary_id=v.id AND (vp.code=? OR vp.label=?))');
      params.push(type, type);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM vocabulary v ${whereSQL}`, params);
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT v.id, v.source_key, v.word, v.reading, v.romaji, v.level
       FROM vocabulary v
       ${whereSQL}
       ORDER BY v.level, v.word
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    if (!rows.length) return res.json({ success: true, data: [], total, page, limit });

    const ids = rows.map(r => r.id);
    const [meanings] = await pool.query(
      `SELECT vocabulary_id, language_code, meaning, sort_order FROM vocabulary_meanings
       WHERE vocabulary_id IN (?) ORDER BY vocabulary_id, language_code, sort_order`, [ids]);
    const [pos] = await pool.query(
      `SELECT vocabulary_id, label FROM vocabulary_parts_of_speech WHERE vocabulary_id IN (?)`, [ids]);
    const [examples] = await pool.query(
      `SELECT vocabulary_id, japanese_text, furigana, meaning_vi, meaning_en FROM vocabulary_examples
       WHERE vocabulary_id IN (?) LIMIT 300`, [ids]);
    const [forms] = await pool.query(
      `SELECT vocabulary_id, form_type, value FROM vocabulary_forms WHERE vocabulary_id IN (?)`, [ids]);

    const data = rows.map(v => {
      const vm = meanings.filter(m => m.vocabulary_id == v.id);
      return {
        id: String(v.id),
        source_key: v.source_key,
        word: v.word,
        reading: v.reading,
        romaji: v.romaji,
        level: v.level,
        meaning_vi: vm.filter(m => m.language_code === 'vi').map(m => m.meaning),
        meaning_en: vm.filter(m => m.language_code === 'en').map(m => m.meaning),
        part_of_speech: pos.filter(p => p.vocabulary_id == v.id).map(p => p.label),
        examples: examples.filter(e => e.vocabulary_id == v.id).map(e => ({
          ja: e.japanese_text, furigana: e.furigana, vi: e.meaning_vi, en: e.meaning_en
        })),
        other_forms: forms.filter(f => f.vocabulary_id == v.id && f.form_type === 'other_form').map(f => f.value),
        other_readings: forms.filter(f => f.vocabulary_id == v.id && f.form_type === 'other_reading').map(f => f.value),
      };
    });

    return res.json({ success: true, data, total, page, limit });
  } catch (err) { next(err); }
}

// GET /api/vocabulary/:id
async function getOne(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    const [rows] = await pool.query('SELECT * FROM vocabulary WHERE id = ? AND is_deleted = 0 LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy từ vựng.' });
    const v = rows[0];
    const [meanings] = await pool.query('SELECT * FROM vocabulary_meanings WHERE vocabulary_id = ? ORDER BY language_code, sort_order', [id]);
    const [pos] = await pool.query('SELECT * FROM vocabulary_parts_of_speech WHERE vocabulary_id = ?', [id]);
    const [examples] = await pool.query('SELECT * FROM vocabulary_examples WHERE vocabulary_id = ?', [id]);
    const [forms] = await pool.query('SELECT * FROM vocabulary_forms WHERE vocabulary_id = ?', [id]);
    return res.json({ success: true, data: {
      id: String(v.id), source_key: v.source_key, word: v.word, reading: v.reading, romaji: v.romaji, level: v.level,
      meaning_vi: meanings.filter(m => m.language_code === 'vi').map(m => m.meaning),
      meaning_en: meanings.filter(m => m.language_code === 'en').map(m => m.meaning),
      part_of_speech: pos.map(p => p.label),
      examples: examples.map(e => ({ ja: e.japanese_text, furigana: e.furigana, vi: e.meaning_vi, en: e.meaning_en })),
      other_forms: forms.filter(f => f.form_type === 'other_form').map(f => f.value),
      other_readings: forms.filter(f => f.form_type === 'other_reading').map(f => f.value),
    }});
  } catch (err) { next(err); }
}

// POST /api/vocabulary (admin)
async function create(req, res, next) {
  const { word, reading, romaji, level } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO vocabulary (word, reading, romaji, level) VALUES (?, ?, ?, ?)',
      [word.trim(), reading.trim(), romaji?.trim() || null, level]
    );
    const vid = r.insertId;
    await insertVocabularyDetails(conn, vid, req.body);
    await conn.commit();
    return res.status(201).json({ success: true, id: vid, message: 'Thêm từ vựng thành công.' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { conn?.release(); }
}

// PUT /api/vocabulary/:id (admin)
async function update(req, res, next) {
  const id = parseInt(req.params.id, 10);
  const { word, reading, romaji, level } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [result] = await conn.query(
      'UPDATE vocabulary SET word=?, reading=?, romaji=?, level=? WHERE id=? AND is_deleted=0',
      [word.trim(), reading.trim(), romaji?.trim() || null, level, id]
    );
    if (!result.affectedRows) {
      const [existing] = await conn.query('SELECT id FROM vocabulary WHERE id=? AND is_deleted=0', [id]);
      if (!existing.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Không tìm thấy từ vựng.' });
      }
    }
    const replaceFields = [
      ['meaning_vi', 'vocabulary_meanings', 'language_code', 'vi'],
      ['meaning_en', 'vocabulary_meanings', 'language_code', 'en'],
      ['part_of_speech', 'vocabulary_parts_of_speech'],
      ['examples', 'vocabulary_examples'],
      ['other_forms', 'vocabulary_forms', 'form_type', 'other_form'],
      ['other_readings', 'vocabulary_forms', 'form_type', 'other_reading'],
    ];
    for (const [field, table, column, value] of replaceFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (table === 'vocabulary_meanings') await conn.query(`DELETE FROM ${table} WHERE vocabulary_id=? AND ${column}=?`, [id, value]);
        else if (table === 'vocabulary_forms') await conn.query(`DELETE FROM ${table} WHERE vocabulary_id=? AND ${column}=?`, [id, value]);
        else await conn.query(`DELETE FROM ${table} WHERE vocabulary_id=?`, [id]);
      }
    }
    await insertVocabularyDetails(conn, id, req.body);
    await conn.commit();
    return res.json({ success: true, message: 'Cập nhật từ vựng thành công.' });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally { conn?.release(); }
}

// DELETE /api/vocabulary/:id (admin)
async function remove(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    const [result] = await pool.query('UPDATE vocabulary SET is_deleted = 1 WHERE id = ? AND is_deleted=0', [id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Không tìm thấy từ vựng.' });
    return res.json({ success: true, message: 'Đã xóa từ vựng.' });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, create, update, remove };
