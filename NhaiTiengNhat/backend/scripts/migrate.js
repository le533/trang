require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function main() {
  const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  for (const statement of schema.split(/;\s*(?:\r?\n|$)/).map(item => item.trim()).filter(Boolean)) {
    if (/^(CREATE DATABASE|USE\s)/i.test(statement)) continue;
    await pool.query(statement);
  }

  const [lessonCourseColumn] = await pool.query(
    `SELECT COUNT(*) AS found FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lessons' AND COLUMN_NAME='course_id'`
  );
  if (!lessonCourseColumn[0].found) {
    await pool.query('ALTER TABLE lessons ADD COLUMN course_id BIGINT UNSIGNED NULL AFTER video_url');
    await pool.query('ALTER TABLE lessons ADD KEY idx_lessons_course (course_id)');
    await pool.query(
      `ALTER TABLE lessons ADD CONSTRAINT fk_lessons_course FOREIGN KEY (course_id)
       REFERENCES courses (id) ON UPDATE CASCADE ON DELETE SET NULL`
    );
  }

  const [courseImageColumn] = await pool.query(
    `SELECT COUNT(*) AS found FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='image_url'`
  );
  if (!courseImageColumn[0].found) {
    await pool.query('ALTER TABLE courses ADD COLUMN image_url VARCHAR(1000) NULL AFTER level');
  }

  await pool.query(
    `INSERT INTO courses (slug, title, description, level, image_url, price_vnd, duration_days, is_published)
     VALUES
       ('n5-foundation', 'N5 · Nền tảng tiếng Nhật', 'Làm quen chữ viết, từ vựng và ngữ pháp căn bản.', 'N5', '/assets/images/course-n5.jpg', 0, NULL, TRUE),
       ('n4-foundation', 'N4 · Giao tiếp thực hành', 'Mở rộng nền tảng và luyện các tình huống thực tế.', 'N4', '/assets/images/course-n4.jpg', 149000, 365, TRUE),
       ('n3-intermediate', 'N3 · Trung cấp toàn diện', 'Đọc hiểu và sử dụng ngữ pháp trung cấp trong ngữ cảnh.', 'N3', '/assets/images/course-n3.jpg', 249000, 365, TRUE),
       ('n2-advanced', 'N2 · Tiếng Nhật nâng cao', 'Tăng tốc đọc hiểu và diễn đạt trong môi trường học tập, công việc.', 'N2', '/assets/images/course-n2.jpg', 349000, 365, TRUE),
       ('n1-mastery', 'N1 · Làm chủ tiếng Nhật', 'Lộ trình chuyên sâu dành cho người học nâng cao.', 'N1', '/assets/images/course-n1.jpg', 449000, 365, TRUE)
     ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description),
       level=VALUES(level), image_url=VALUES(image_url), price_vnd=VALUES(price_vnd), duration_days=VALUES(duration_days),
       is_published=VALUES(is_published)`
  );

  await pool.query(
    `UPDATE lessons l
     JOIN courses c ON c.slug = CASE l.level
       WHEN 'N5' THEN 'n5-foundation'
       WHEN 'N4' THEN 'n4-foundation'
       WHEN 'N3' THEN 'n3-intermediate'
       WHEN 'N2' THEN 'n2-advanced'
       WHEN 'N1' THEN 'n1-mastery'
     END
     SET l.course_id=c.id
     WHERE l.course_id IS NULL AND l.is_deleted=0`
  );

  await pool.query(
    `UPDATE lessons l JOIN courses c ON c.id=l.course_id
     SET l.objectives=COALESCE(NULLIF(l.objectives, ''), ?), l.content=?
     WHERE c.slug='n5-foundation' AND l.title='Làm quen với lời chào'
       AND (l.content IS NULL OR TRIM(l.content)='')`,
    [
      'Biết dùng các lời chào thông dụng theo thời điểm và giới thiệu bản thân khi gặp lần đầu.',
      `CHÀO HỎI THEO THỜI ĐIỂM\nおはようございます。 — Chào buổi sáng (lịch sự).\nこんにちは。 — Xin chào, thường dùng ban ngày.\nこんばんは。 — Chào buổi tối.\n\nGẶP MỘT NGƯỜI LẦN ĐẦU\nはじめまして。 — Rất vui được gặp bạn.\nわたしはアンです。 — Tôi là An.\nどうぞよろしくお願いします。 — Mong được giúp đỡ / Rất mong được làm quen.\n\nHỘI THOẠI\nA: はじめまして。わたしはアンです。\nB: はじめまして。どうぞよろしくお願いします。\n\nLƯU Ý\nこんにちは và こんばんは thường không dùng như lời chào buổi sáng. Trong giao tiếp thân mật, はじめまして thường mở đầu phần giới thiệu; どうぞよろしくお願いします khép lại.`,
    ]
  );

  const sampleLessons = [
    {
      courseSlug: 'n4-foundation',
      title: 'N4 · Diễn tả hai hành động với 〜ながら',
      level: 'N4',
      summary: 'Dùng 〜ながら để nói một người thực hiện hai hành động cùng lúc.',
      objectives: 'Biết cách tạo thể ます bỏ ます + ながら; xác định hành động chính ở cuối câu.',
      content: `CẤU TRÚC\nĐộng từ thể ます (bỏ ます) + ながら + hành động chính.\n\nCÁCH DÙNG\nDùng khi cùng một chủ thể làm hai việc đồng thời. Hành động được nhấn mạnh thường đặt ở cuối câu.\n\nVÍ DỤ\n音楽を聞きながら勉強します。\nTôi vừa nghe nhạc vừa học.\n\n歩きながら電話しないでください。\nXin đừng vừa đi vừa gọi điện.\n\nLƯU Ý\nHai hành động thường do cùng một người thực hiện. Không dùng cấu trúc này để ghép hai chủ thể khác nhau.`,
    },
    {
      courseSlug: 'n3-intermediate',
      title: 'N3 · Kết quả và sự tiếc nuối với 〜てしまう',
      level: 'N3',
      summary: 'Phân biệt sắc thái hoàn tất và tiếc nuối của mẫu 〜てしまう.',
      objectives: 'Chia động từ sang thể て; nhận biết sắc thái theo ngữ cảnh và cách nói thân mật 〜ちゃう/〜じゃう.',
      content: `CẤU TRÚC\nĐộng từ thể て + しまう. Trong hội thoại thân mật, 〜てしまう thường rút gọn thành 〜ちゃう; 〜でしまう thành 〜じゃう.\n\nHAI SẮC THÁI\n1. Hành động đã hoàn tất: 宿題を全部やってしまいました。 — Tôi đã làm xong toàn bộ bài tập.\n2. Điều không mong muốn hoặc tiếc nuối: 財布を忘れてしまいました。 — Tôi lỡ quên ví mất rồi.\n\nCÁCH HIỂU\nKhông phải lúc nào 〜てしまう cũng mang nghĩa tiêu cực. Dựa vào nội dung và ngữ điệu để xác định sắc thái.\n\nLUYỆN TẬP\nThử viết một câu về việc bạn đã hoàn thành và một câu về điều bạn lỡ làm.`,
    },
    {
      courseSlug: 'n2-advanced',
      title: 'N2 · Suy luận chắc chắn với 〜に違いない',
      level: 'N2',
      summary: 'Diễn đạt phán đoán có cơ sở với mẫu 〜に違いない.',
      objectives: 'Kết hợp danh từ, tính từ và động từ với 〜に違いない; phân biệt suy luận với sự thật đã xác nhận.',
      content: `CẤU TRÚC\nĐộng từ thể thường + に違いない\nTính từ い thể thường + に違いない\nTính từ な / danh từ + である + に違いない\n\nÝ NGHĨA\nNgười nói đưa ra nhận định rất có khả năng đúng dựa trên bằng chứng, nhưng vẫn là suy luận chứ chưa phải xác nhận tuyệt đối.\n\nVÍ DỤ\n毎日練習しているから、彼は上手になったに違いない。\nVì ngày nào cũng luyện tập nên chắc hẳn anh ấy đã tiến bộ.\n\nあの店はいつも人が多い。料理がおいしいに違いない。\nQuán đó lúc nào cũng đông. Chắc hẳn đồ ăn ngon.\n\nLƯU Ý\nTrong văn viết trang trọng có thể gặp 〜に相違ない với sắc thái gần nghĩa.`,
    },
    {
      courseSlug: 'n1-mastery',
      title: 'N1 · Văn phong trang trọng với 〜を余儀なくされる',
      level: 'N1',
      summary: 'Hiểu mẫu diễn đạt trang trọng về việc buộc phải làm điều gì do hoàn cảnh.',
      objectives: 'Nhận diện danh từ + を余儀なくされる trong tin tức/văn bản; phân tích tác nhân và nguyên nhân.',
      content: `CẤU TRÚC\nDanh từ + を余儀なくされる\n\nÝ NGHĨA\nDiễn tả một cá nhân hoặc tổ chức bị hoàn cảnh buộc phải làm điều gì đó ngoài dự định. Đây là cách diễn đạt trang trọng, thường dùng trong tin tức và văn viết.\n\nVÍ DỤ\n大雨のため、試合は中止を余儀なくされた。\nDo mưa lớn, trận đấu buộc phải hủy.\n\n会社は計画の変更を余儀なくされた。\nCông ty buộc phải thay đổi kế hoạch.\n\nPHÂN TÍCH\nDanh từ đứng trước を là hành động hoặc quyết định bị ép buộc. Nguyên nhân thường được nêu bằng ため, ので hoặc ngữ cảnh trước đó.\n\nLƯU Ý\nKhông nhầm với một lựa chọn tự nguyện; mẫu này nhấn mạnh áp lực từ hoàn cảnh.`,
    },
  ];

  for (const lesson of sampleLessons) {
    await pool.query(
      `INSERT INTO lessons (title, level, summary, objectives, content, course_id)
       SELECT ?, ?, ?, ?, ?, c.id FROM courses c
       WHERE c.slug=? AND NOT EXISTS (
         SELECT 1 FROM lessons l WHERE l.level=? AND l.title=?
       )`,
      [lesson.title, lesson.level, lesson.summary, lesson.objectives, lesson.content,
        lesson.courseSlug, lesson.level, lesson.title]
    );
  }
  console.log('Đã áp dụng schema, gắn bài hiện có và đồng bộ 5 khóa học JLPT.');
}

main()
  .catch(error => {
    console.error('Không thể cập nhật database:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
