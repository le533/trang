require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

const DATA_DIR = path.resolve(__dirname, '../../data');
const LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);
const GRAMMAR_SAMPLES = [
  ['N5', 'Câu danh từ với は và です', 'N は N です', 'Giới thiệu hoặc xác định một người/vật bằng câu khẳng định lịch sự.', 'Danh từ + は + danh từ + です', '私は学生です。', 'わたしはがくせいです。', 'Tôi là học sinh/sinh viên.', 'I am a student.'],
  ['N5', 'Phủ định danh từ với じゃありません', 'N は N じゃありません', 'Phủ định lịch sự cho câu danh từ trong hội thoại.', 'Danh từ + は + danh từ + じゃありません', '田中さんは先生じゃありません。', 'たなかさんはせんせいじゃありません。', 'Anh Tanaka không phải là giáo viên.', 'Mr. Tanaka is not a teacher.'],
  ['N5', 'Hỏi địa điểm với どこ', 'N は どこですか', 'Hỏi vị trí của người hoặc vật.', 'Danh từ + は + どこ + ですか', '駅はどこですか。', 'えきはどこですか。', 'Nhà ga ở đâu?', 'Where is the station?'],
  ['N5', 'Tân ngữ với trợ từ を', 'N を Vます', 'Đánh dấu tân ngữ trực tiếp của động từ.', 'Danh từ + を + động từ', '水を飲みます。', 'みずをのみます。', 'Tôi uống nước.', 'I drink water.'],
  ['N5', 'Thời điểm với に', 'Thời gian に Vます', 'Nêu thời điểm cụ thể mà hành động diễn ra.', 'Mốc thời gian + に + động từ', '七時に起きます。', 'しちじにおきます。', 'Tôi thức dậy lúc bảy giờ.', 'I get up at seven.'],
  ['N4', 'Hai hành động đồng thời với ながら', 'Vます bỏ ます + ながら', 'Diễn tả cùng một chủ thể làm hai hành động đồng thời.', 'Động từ thể ます bỏ ます + ながら + hành động chính', '音楽を聞きながら勉強します。', 'おんがくをききながらべんきょうします。', 'Tôi vừa nghe nhạc vừa học.', 'I study while listening to music.'],
  ['N4', 'Liệt kê hành động tiêu biểu với たり', 'Vたり、Vたりします', 'Nêu một số hành động tiêu biểu trong nhiều hoạt động.', 'Động từ thể た + り, lặp lại rồi します', '日曜日は本を読んだり、散歩したりします。', 'にちようびはほんをよんだり、さんぽしたりします。', 'Chủ nhật tôi đọc sách, đi dạo và làm những việc khác.', 'On Sundays I read and take walks, among other things.'],
  ['N4', 'Kinh nghiệm với たことがあります', 'V thể た + ことがあります', 'Hỏi hoặc kể về trải nghiệm đã từng có.', 'Động từ thể た + ことがあります', '京都へ行ったことがあります。', 'きょうとへいったことがあります。', 'Tôi đã từng đến Kyoto.', 'I have been to Kyoto.'],
  ['N4', 'Đưa ra lời khuyên với ほうがいい', 'Vた + ほうがいいです', 'Đề xuất một việc nên làm dựa trên tình huống.', 'Động từ thể た + ほうがいいです', '早く寝たほうがいいです。', 'はやくねたほうがいいです。', 'Bạn nên ngủ sớm.', 'You should go to bed early.'],
  ['N4', 'Lý do với ので', '普通形 + ので', 'Nêu lý do với sắc thái giải thích nhẹ nhàng, lịch sự.', 'Thể thường + ので; tính từ な/danh từ + な + ので', '雨が降っているので、出かけません。', 'あめがふっているので、でかけません。', 'Vì trời đang mưa nên tôi không ra ngoài.', 'Because it is raining, I will not go out.'],
  ['N3', 'Hoàn tất hoặc tiếc nuối với てしまう', 'Vて + しまう', 'Diễn tả sự hoàn tất hoặc điều ngoài ý muốn tùy ngữ cảnh.', 'Động từ thể て + しまう', '財布を忘れてしまいました。', 'さいふをわすれてしまいました。', 'Tôi lỡ quên ví mất rồi.', 'I accidentally forgot my wallet.'],
  ['N3', 'Duy trì thói quen với ようにする', 'Vる / Vない + ようにする', 'Nói về nỗ lực chủ động tạo hoặc duy trì một thói quen.', 'Động từ thể từ điển hoặc phủ định + ようにする', '毎日、日本語を読むようにしています。', 'まいにち、にほんごをよむようにしています。', 'Tôi cố gắng đọc tiếng Nhật mỗi ngày.', 'I try to read Japanese every day.'],
  ['N3', 'Quyết định với ことにする', 'Vる / Vない + ことにする', 'Diễn tả quyết định do chính người nói đưa ra.', 'Động từ thể từ điển hoặc phủ định + ことにする', '来月から毎朝走ることにしました。', 'らいげつからまいあさはしることにしました。', 'Tôi đã quyết định chạy bộ mỗi sáng từ tháng sau.', 'I decided to run every morning starting next month.'],
  ['N3', 'Hành động vừa mới xảy ra với たばかり', 'Vた + ばかり', 'Nhấn mạnh hành động vừa mới hoàn thành theo cảm nhận người nói.', 'Động từ thể た + ばかりです', '昼ご飯を食べたばかりです。', 'ひるごはんをたべたばかりです。', 'Tôi vừa mới ăn trưa xong.', 'I have just eaten lunch.'],
  ['N3', 'Phủ định suy luận khái quát với わけではない', '普通形 + わけではない', 'Đính chính rằng một điều không đúng trong mọi trường hợp.', 'Thể thường + わけではない', '高い物がいつもいいわけではありません。', 'たかいものがいつもいいわけではありません。', 'Đồ đắt tiền không phải lúc nào cũng tốt.', 'Expensive things are not always good.'],
  ['N2', 'Suy luận mạnh với に違いない', '普通形 + に違いない', 'Đưa ra kết luận có cơ sở với mức độ tin chắc cao.', 'Thể thường + に違いない; danh từ/tính từ な + に違いない', '毎日練習したから、上達したに違いない。', 'まいにちれんしゅうしたから、じょうたつしたにちがいない。', 'Vì luyện tập mỗi ngày nên chắc hẳn đã tiến bộ.', 'They must have improved because they practiced every day.'],
  ['N2', 'Đối chiếu với に対して', 'N / 普通形 + のに対して', 'So sánh hai phía có đặc điểm hoặc tình huống đối lập.', 'Danh từ + に対して; mệnh đề + のに対して', '兄は社交的なのに対して、弟は静かです。', 'あにはしゃこうてきなのにたいして、おとうとはしずかです。', 'Trái với anh trai hòa đồng, em trai lại trầm tính.', 'Whereas the older brother is sociable, the younger brother is quiet.'],
  ['N2', 'Nhượng bộ với ものの', '普通形 + ものの', 'Nêu sự thật đầu tiên nhưng kết quả sau đó không như mong đợi.', 'Thể thường + ものの; tính từ な/danh từ + である + ものの', '薬を飲んだものの、まだ熱があります。', 'くすりをのんだものの、まだねつがあります。', 'Tuy đã uống thuốc nhưng tôi vẫn còn sốt.', 'Although I took medicine, I still have a fever.'],
  ['N2', 'Nguy cơ với おそれがある', 'N / Vる + おそれがある', 'Cảnh báo một khả năng xấu có thể xảy ra.', 'Danh từ hoặc động từ thể từ điển + おそれがある', '台風で電車が止まるおそれがあります。', 'たいふうででんしゃがとまるおそれがあります。', 'Có nguy cơ tàu điện ngừng chạy do bão.', 'There is a risk that trains will stop because of the typhoon.'],
  ['N2', 'Khả năng dẫn đến hậu quả với かねない', 'Vます bỏ ます + かねない', 'Cảnh báo một hành động có thể dẫn tới hậu quả tiêu cực.', 'Động từ thể ます bỏ ます + かねない', '確認しないと、大きな間違いを起こしかねません。', 'かくにんしないと、おおきなまちがいをおこしかねません。', 'Nếu không kiểm tra, có thể gây ra sai sót lớn.', 'Failing to check could cause a serious mistake.'],
  ['N1', 'Bị buộc phải làm với を余儀なくされる', 'N + を余儀なくされる', 'Văn phong trang trọng diễn tả việc bị hoàn cảnh buộc phải làm điều gì.', 'Danh từ chỉ hành động + を余儀なくされる', '大雨のため、試合は中止を余儀なくされました。', 'おおあめのため、しあいはちゅうしをよぎなくされました。', 'Do mưa lớn, trận đấu buộc phải hủy.', 'The match was forced to be canceled because of heavy rain.'],
];

function readJson(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function insertRows(conn, sql, rows) {
  if (!rows.length) return Promise.resolve();
  return conn.query(sql, [rows]);
}

async function seedVocabulary() {
  const source = readJson('vocabulary.json');
  const words = Array.isArray(source.words) ? source.words : [];
  const conn = await pool.getConnection();
  const idsByWord = new Map();

  try {
    await conn.beginTransaction();
    for (const word of words) {
      if (!word.id || !word.word || !word.reading || !LEVELS.has(word.level)) {
        throw new Error(`Từ vựng không hợp lệ trong data/vocabulary.json: ${word.id || '(không có id)'}`);
      }

      const [result] = await conn.query(
        `INSERT INTO vocabulary (source_key, word, reading, romaji, level, jmdict_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id=LAST_INSERT_ID(id), word=VALUES(word), reading=VALUES(reading),
           romaji=VALUES(romaji), level=VALUES(level), jmdict_id=VALUES(jmdict_id),
           is_deleted=FALSE`,
        [String(word.id).slice(0, 64), word.word, word.reading, word.romaji || null, word.level, word.jmdict_id || null]
      );
      const vocabularyId = result.insertId;
      idsByWord.set(word.word, vocabularyId);

      await conn.query('DELETE FROM vocabulary_meanings WHERE vocabulary_id=?', [vocabularyId]);
      await conn.query('DELETE FROM vocabulary_parts_of_speech WHERE vocabulary_id=?', [vocabularyId]);
      await conn.query('DELETE FROM vocabulary_forms WHERE vocabulary_id=?', [vocabularyId]);
      await conn.query('DELETE FROM vocabulary_examples WHERE vocabulary_id=?', [vocabularyId]);

      const meanings = [];
      for (const [language, code] of [['en', 'en'], ['vi', 'vi']]) {
        (Array.isArray(word[`meaning_${language}`]) ? word[`meaning_${language}`] : [])
          .filter(Boolean)
          .forEach((meaning, index) => meanings.push([vocabularyId, code, meaning, index + 1]));
      }
      await insertRows(
        conn,
        `INSERT INTO vocabulary_meanings (vocabulary_id, language_code, meaning, sort_order) VALUES ?`,
        meanings
      );

      const labels = Array.isArray(word.part_of_speech) ? word.part_of_speech : [];
      const codes = Array.isArray(word.part_of_speech_codes) ? word.part_of_speech_codes : [];
      await insertRows(
        conn,
        'INSERT INTO vocabulary_parts_of_speech (vocabulary_id, code, label) VALUES ?',
        labels.map((label, index) => [vocabularyId, codes[index] || null, label])
      );

      const forms = [
        ...(word.other_forms || []).map(value => [vocabularyId, 'other_form', value]),
        ...(word.other_readings || []).map(value => [vocabularyId, 'other_reading', value]),
      ];
      await insertRows(conn, 'INSERT INTO vocabulary_forms (vocabulary_id, form_type, value) VALUES ?', forms);

      await insertRows(
        conn,
        `INSERT INTO vocabulary_examples
         (vocabulary_id, japanese_text, furigana, meaning_vi, meaning_en, tatoeba_id) VALUES ?`,
        (word.examples || []).filter(example => example.ja).map(example => [
          vocabularyId, example.ja, example.furigana || null, example.vi || null, example.en || null,
          example.tatoeba_id || null,
        ])
      );
    }

    await conn.commit();
    return { count: words.length, idsByWord };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function seedKanji(vocabularyIds) {
  const kanjiList = readJson('kanji.json');
  if (!Array.isArray(kanjiList)) throw new Error('data/kanji.json phải là một mảng.');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    const idsByCharacter = new Map();
    for (const item of kanjiList) {
      if (!item.kanji || !item.meaning || !LEVELS.has(item.jlpt) || !Number.isInteger(Number(item.strokes))) {
        throw new Error(`Kanji không hợp lệ trong data/kanji.json: ${item.kanji || '(không có chữ)'}`);
      }

      const [result] = await conn.query(
        `INSERT INTO kanji (source_id, \`character\`, han_viet, meaning, jlpt_level, stroke_count)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id=LAST_INSERT_ID(id), \`character\`=VALUES(\`character\`), han_viet=VALUES(han_viet),
           meaning=VALUES(meaning), jlpt_level=VALUES(jlpt_level), stroke_count=VALUES(stroke_count),
           is_deleted=FALSE`,
        [item.id || null, item.kanji, item.hanViet || null, item.meaning, item.jlpt, Number(item.strokes)]
      );
      const kanjiId = result.insertId;
      idsByCharacter.set(item.kanji, kanjiId);

      await conn.query('DELETE FROM kanji_readings WHERE kanji_id=?', [kanjiId]);
      await conn.query('DELETE FROM kanji_radicals WHERE kanji_id=?', [kanjiId]);
      await conn.query('DELETE FROM kanji_vocabulary WHERE kanji_id=?', [kanjiId]);

      const readings = [
        ...(item.kun || []).map((reading, index) => [kanjiId, 'kun', reading, index + 1]),
        ...(item.on || []).map((reading, index) => [kanjiId, 'on', reading, index + 1]),
      ];
      await insertRows(conn, 'INSERT INTO kanji_readings (kanji_id, reading_type, reading, sort_order) VALUES ?', readings);

      for (const radical of new Set(item.radicals || [])) {
        await conn.query('INSERT INTO radicals (\`character\`) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [radical]);
        const [radicalRows] = await conn.query('SELECT id FROM radicals WHERE \`character\`=?', [radical]);
        await conn.query('INSERT IGNORE INTO kanji_radicals (kanji_id, radical_id) VALUES (?,?)', [kanjiId, radicalRows[0].id]);
      }
    }

    const links = [];
    for (const [word, vocabularyId] of vocabularyIds) {
      for (const character of new Set(Array.from(word))) {
        const kanjiId = idsByCharacter.get(character);
        if (kanjiId) links.push([kanjiId, vocabularyId]);
      }
    }
    for (let index = 0; index < links.length; index += 500) {
      await insertRows(conn, 'INSERT IGNORE INTO kanji_vocabulary (kanji_id, vocabulary_id) VALUES ?', links.slice(index, index + 500));
    }

    await conn.commit();
    return kanjiList.length;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function seedLearningContent() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [courses] = await conn.query('SELECT slug, level FROM courses');
    const courseByLevel = new Map(courses.map(course => [course.level, course.slug]));
    for (const level of LEVELS) {
      if (!courseByLevel.has(level)) throw new Error(`Chưa có khóa học cho cấp ${level}; hãy chạy npm run db:migrate trước.`);
    }

    for (const [level, title, form, meaning, structure, japanese, reading, meaningVi, meaningEn] of GRAMMAR_SAMPLES) {
      let [grammarRows] = await conn.query(
        'SELECT id FROM grammar_points WHERE title=? AND level=? ORDER BY id LIMIT 1',
        [title, level]
      );
      if (!grammarRows.length) {
        const [result] = await conn.query(
          `INSERT INTO grammar_points (title, level, form, meaning, structure)
           VALUES (?, ?, ?, ?, ?)`,
          [title, level, form, meaning, structure]
        );
        grammarRows = [{ id: result.insertId }];
      }
      await conn.query(
        `INSERT INTO grammar_examples
         (grammar_point_id, japanese_text, reading, meaning_vi, meaning_en, sort_order)
         SELECT ?, ?, ?, ?, ?, 1
         WHERE NOT EXISTS (
           SELECT 1 FROM grammar_examples WHERE grammar_point_id=? AND sort_order=1
         )`,
        [grammarRows[0].id, japanese, reading, meaningVi, meaningEn, grammarRows[0].id]
      );

      const lessonTitle = `Ngữ pháp ${level} · ${title}`;
      const summary = `${form}: ${meaning}`;
      const lessonContent = `CẤU TRÚC\n${structure}\n\nÝ NGHĨA\n${meaning}\n\nVÍ DỤ\n${japanese}\n${meaningVi}\n\nCÁCH HỌC\nĐọc ví dụ, xác định phần ngữ pháp và tự đặt một câu tương tự.`;
      await conn.query(
        `INSERT INTO lessons (title, level, duration, summary, objectives, content, course_id)
         SELECT ?, ?, '20 phút', ?, ?, ?, c.id
         FROM courses c
         WHERE c.slug=? AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.title=? AND l.level=?)`,
        [lessonTitle, level, summary, `Nhận biết và vận dụng ${form} trong câu đúng ngữ cảnh.`,
          lessonContent, courseByLevel.get(level), lessonTitle, level]
      );

      const exerciseTitle = `Luyện tập ${level} · ${title}`;
      const [exerciseRows] = await conn.query(
        'SELECT id FROM exercises WHERE title=? AND level=? ORDER BY id LIMIT 1',
        [exerciseTitle, level]
      );
      let exerciseId;
      if (exerciseRows.length) {
        exerciseId = exerciseRows[0].id;
      } else {
        const [result] = await conn.query(
          `INSERT INTO exercises (title, level, topic, question_count, description)
           VALUES (?, ?, 'Ngữ pháp', 1, ?)`,
          [exerciseTitle, level, `Luyện nhận biết mẫu ${form} và cách dùng: ${meaning}`]
        );
        exerciseId = result.insertId;
      }

      const [questionResult] = await conn.query(
        `INSERT INTO exercise_questions (exercise_id, question_text, question_type, sort_order, explanation)
         VALUES (?, ?, 'multiple_choice', 1, ?)
         ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), question_text=VALUES(question_text),
           explanation=VALUES(explanation)`,
        [exerciseId, `Mẫu nào phù hợp với ý nghĩa: “${meaning}”`, `${form}: ${structure}`]
      );
      const questionId = questionResult.insertId;
      const distractors = GRAMMAR_SAMPLES
        .filter(sample => sample[0] === level && sample[2] !== form)
        .map(sample => sample[2]);
      for (const sample of GRAMMAR_SAMPLES) {
        if (sample[2] !== form && !distractors.includes(sample[2])) distractors.push(sample[2]);
      }
      const options = [form, ...distractors.slice(0, 3)];
      const correctPosition = GRAMMAR_SAMPLES.findIndex(sample => sample[2] === form) % options.length;
      const correctOption = options.shift();
      options.splice(correctPosition, 0, correctOption);
      for (let index = 0; index < options.length; index += 1) {
        await conn.query(
          `INSERT INTO exercise_choices (question_id, choice_text, is_correct, sort_order)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE choice_text=VALUES(choice_text), is_correct=VALUES(is_correct)`,
          [questionId, options[index], index === correctPosition, index + 1]
        );
      }
    }
    const grammarTitles = GRAMMAR_SAMPLES.map(sample => sample[1]);
    const lessonTitles = GRAMMAR_SAMPLES.map(([level, title]) => `Ngữ pháp ${level} · ${title}`);
    const exerciseTitles = GRAMMAR_SAMPLES.map(([level, title]) => `Luyện tập ${level} · ${title}`);
    const [counts] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM grammar_points WHERE title IN (?)) AS grammar_count,
         (SELECT COUNT(*) FROM grammar_examples ge
          JOIN grammar_points gp ON gp.id=ge.grammar_point_id WHERE gp.title IN (?)) AS example_count,
         (SELECT COUNT(*) FROM lessons WHERE title IN (?)) AS lesson_count,
         (SELECT COUNT(*) FROM exercises WHERE title IN (?)) AS exercise_count,
         (SELECT COUNT(*) FROM exercise_questions q
          JOIN exercises e ON e.id=q.exercise_id WHERE e.title IN (?)) AS question_count,
         (SELECT COUNT(*) FROM exercise_choices ch
          JOIN exercise_questions q ON q.id=ch.question_id
          JOIN exercises e ON e.id=q.exercise_id WHERE e.title IN (?)) AS choice_count`,
      [grammarTitles, grammarTitles, lessonTitles, exerciseTitles, exerciseTitles, exerciseTitles]
    );
    const seeded = counts[0];
    if (seeded.grammar_count < 21 || seeded.example_count < 21 || seeded.lesson_count < 21 ||
        seeded.exercise_count < 21 || seeded.question_count < 21 || seeded.choice_count < 84) {
      throw new Error('Dữ liệu học tập chưa đạt ngưỡng tối thiểu 21 mục và 4 lựa chọn mỗi bài tập.');
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function main() {
  await pool.query(
    `INSERT INTO roles (name) VALUES ('user'), ('admin')
     ON DUPLICATE KEY UPDATE name=VALUES(name)`
  );
  const { count: vocabularyCount, idsByWord } = await seedVocabulary();
  const kanjiCount = await seedKanji(idsByWord);
  await seedLearningContent();
  await pool.query(
    `INSERT INTO data_sources (name, source_url, source_file, source_version, license, notes)
     VALUES ('OpenJLPT', 'https://github.com/evanclan/OpenJLPT', 'data/vocabulary.json', '0.3.0', 'CC BY-SA 4.0',
       'Vietnamese meanings are intentionally left empty until verified.')
     ON DUPLICATE KEY UPDATE source_url=VALUES(source_url), source_file=VALUES(source_file),
       license=VALUES(license), notes=VALUES(notes)`
  );
  console.log(`Đã đồng bộ ${vocabularyCount} từ vựng, ${kanjiCount} Kanji và 21 bài học/ngữ pháp/bài tập vào MySQL.`);
}

main()
  .catch(err => {
    console.error('Không thể nạp dữ liệu mẫu:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
