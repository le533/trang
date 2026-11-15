-- Nihongo Learning database schema for MySQL 8.x
-- Run with an account allowed to create databases.
CREATE DATABASE IF NOT EXISTS nihongo_learning
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE nihongo_learning;

CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id TINYINT UNSIGNED NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL COMMENT 'Server-side password hash only; never plaintext',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role_id, status),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS vocabulary (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_key VARCHAR(64) NULL COMMENT 'Stable source ID, e.g. n5-...',
  word VARCHAR(255) NOT NULL,
  reading VARCHAR(255) NOT NULL,
  romaji VARCHAR(255) NULL,
  level ENUM('N5','N4','N3','N2','N1') NOT NULL,
  jmdict_id BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vocabulary_source_key (source_key),
  KEY idx_vocabulary_level_word (level, word),
  KEY idx_vocabulary_reading (reading),
  KEY idx_vocabulary_jmdict (jmdict_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS vocabulary_meanings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vocabulary_id BIGINT UNSIGNED NOT NULL,
  language_code CHAR(2) NOT NULL COMMENT 'en, vi, etc.',
  meaning VARCHAR(1000) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vocab_meaning_order (vocabulary_id, language_code, sort_order),
  KEY idx_vocab_meaning_language (language_code),
  CONSTRAINT fk_vocab_meanings_vocabulary FOREIGN KEY (vocabulary_id) REFERENCES vocabulary (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS vocabulary_parts_of_speech (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vocabulary_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NULL,
  label VARCHAR(160) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_vocab_pos_entry (vocabulary_id),
  KEY idx_vocab_pos_code (code),
  CONSTRAINT fk_vocab_pos_vocabulary FOREIGN KEY (vocabulary_id) REFERENCES vocabulary (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS vocabulary_forms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vocabulary_id BIGINT UNSIGNED NOT NULL,
  form_type ENUM('other_form','other_reading') NOT NULL,
  value VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_vocab_forms_entry (vocabulary_id, form_type),
  CONSTRAINT fk_vocab_forms_vocabulary FOREIGN KEY (vocabulary_id) REFERENCES vocabulary (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS vocabulary_examples (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vocabulary_id BIGINT UNSIGNED NOT NULL,
  japanese_text TEXT NOT NULL,
  furigana TEXT NULL,
  meaning_vi TEXT NULL,
  meaning_en TEXT NULL,
  tatoeba_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_vocab_examples_entry (vocabulary_id),
  KEY idx_vocab_examples_tatoeba (tatoeba_id),
  CONSTRAINT fk_vocab_examples_vocabulary FOREIGN KEY (vocabulary_id) REFERENCES vocabulary (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS kanji (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id BIGINT UNSIGNED NULL COMMENT 'ID from current kanji.json where applicable',
  `character` VARCHAR(8) NOT NULL,
  han_viet VARCHAR(120) NULL,
  meaning VARCHAR(1000) NOT NULL,
  jlpt_level ENUM('N5','N4','N3','N2','N1') NOT NULL,
  stroke_count SMALLINT UNSIGNED NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kanji_character (`character`),
  UNIQUE KEY uq_kanji_source_id (source_id),
  KEY idx_kanji_level_strokes (jlpt_level, stroke_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS kanji_readings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kanji_id BIGINT UNSIGNED NOT NULL,
  reading_type ENUM('kun','on') NOT NULL,
  reading VARCHAR(255) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kanji_reading_order (kanji_id, reading_type, sort_order),
  KEY idx_kanji_reading_value (reading),
  CONSTRAINT fk_kanji_readings_kanji FOREIGN KEY (kanji_id) REFERENCES kanji (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS radicals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `character` VARCHAR(16) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_radicals_character (`character`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS kanji_radicals (
  kanji_id BIGINT UNSIGNED NOT NULL,
  radical_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (kanji_id, radical_id),
  KEY idx_kanji_radicals_radical (radical_id),
  CONSTRAINT fk_kanji_radicals_kanji FOREIGN KEY (kanji_id) REFERENCES kanji (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_kanji_radicals_radical FOREIGN KEY (radical_id) REFERENCES radicals (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS kanji_vocabulary (
  kanji_id BIGINT UNSIGNED NOT NULL,
  vocabulary_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (kanji_id, vocabulary_id),
  KEY idx_kanji_vocab_vocabulary (vocabulary_id),
  CONSTRAINT fk_kanji_vocab_kanji FOREIGN KEY (kanji_id) REFERENCES kanji (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_kanji_vocab_vocabulary FOREIGN KEY (vocabulary_id) REFERENCES vocabulary (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  level ENUM('N5','N4','N3','N2','N1') NOT NULL,
  image_url VARCHAR(1000) NULL,
  price_vnd BIGINT UNSIGNED NOT NULL DEFAULT 0,
  duration_days SMALLINT UNSIGNED NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_slug (slug),
  KEY idx_courses_level_published (level, is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS lessons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  level ENUM('N5','N4','N3','N2','N1') NOT NULL,
  duration VARCHAR(80) NULL,
  summary TEXT NOT NULL,
  objectives TEXT NULL,
  content LONGTEXT NULL,
  video_url VARCHAR(1000) NULL,
  course_id BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lessons_level (level),
  KEY idx_lessons_course (course_id),
  CONSTRAINT fk_lessons_course FOREIGN KEY (course_id) REFERENCES courses (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS grammar_points (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  level ENUM('N5','N4','N3','N2','N1') NOT NULL,
  form VARCHAR(255) NULL,
  meaning VARCHAR(1000) NOT NULL,
  structure TEXT NULL,
  video_url VARCHAR(1000) NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_grammar_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS grammar_examples (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  grammar_point_id BIGINT UNSIGNED NOT NULL,
  japanese_text TEXT NOT NULL,
  reading TEXT NULL,
  meaning_vi TEXT NULL,
  meaning_en TEXT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_grammar_examples_point (grammar_point_id),
  CONSTRAINT fk_grammar_examples_point FOREIGN KEY (grammar_point_id) REFERENCES grammar_points (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS exercises (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  level ENUM('N5','N4','N3','N2','N1') NOT NULL,
  topic VARCHAR(255) NULL,
  question_count SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  description TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_exercises_level_topic (level, topic)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS exercise_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  exercise_id BIGINT UNSIGNED NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('multiple_choice','short_answer','true_false') NOT NULL DEFAULT 'multiple_choice',
  sort_order SMALLINT UNSIGNED NOT NULL,
  explanation TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exercise_question_order (exercise_id, sort_order),
  CONSTRAINT fk_questions_exercise FOREIGN KEY (exercise_id) REFERENCES exercises (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS exercise_choices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  choice_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_choice_order (question_id, sort_order),
  KEY idx_choices_question_correct (question_id, is_correct),
  CONSTRAINT fk_choices_question FOREIGN KEY (question_id) REFERENCES exercise_questions (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS lesson_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  lesson_id BIGINT UNSIGNED NOT NULL,
  status ENUM('not_started','in_progress','completed') NOT NULL DEFAULT 'not_started',
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lesson_progress_user_lesson (user_id, lesson_id),
  KEY idx_lesson_progress_user_status (user_id, status),
  CONSTRAINT fk_lesson_progress_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_lesson_progress_lesson FOREIGN KEY (lesson_id) REFERENCES lessons (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS exercise_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  exercise_id BIGINT UNSIGNED NOT NULL,
  attempt_number INT UNSIGNED NOT NULL,
  score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  correct_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  total_questions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_user_exercise_number (user_id, exercise_id, attempt_number),
  KEY idx_attempt_user_completed (user_id, completed_at),
  KEY idx_attempt_exercise_completed (exercise_id, completed_at),
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_attempts_exercise FOREIGN KEY (exercise_id) REFERENCES exercises (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS exercise_attempt_answers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attempt_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  selected_choice_id BIGINT UNSIGNED NULL,
  answer_text TEXT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_question (attempt_id, question_id),
  KEY idx_attempt_answers_question (question_id),
  CONSTRAINT fk_attempt_answers_attempt FOREIGN KEY (attempt_id) REFERENCES exercise_attempts (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_attempt_answers_question FOREIGN KEY (question_id) REFERENCES exercise_questions (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_attempt_answers_choice FOREIGN KEY (selected_choice_id) REFERENCES exercise_choices (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS data_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  source_url VARCHAR(500) NULL,
  source_file VARCHAR(255) NULL,
  source_version VARCHAR(40) NULL,
  license VARCHAR(120) NULL,
  notes TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_data_sources_name_version (name, source_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_learning_stats (
  user_id BIGINT UNSIGNED NOT NULL,
  level ENUM('N5','N4','N3','N2','N1') NOT NULL DEFAULT 'N5',
  completed_lessons INT UNSIGNED NOT NULL DEFAULT 0,
  accuracy DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  streak_days INT UNSIGNED NOT NULL DEFAULT 0,
  last_active_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY idx_learning_stats_level_active (level, last_active_at),
  CONSTRAINT fk_learning_stats_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_ref VARCHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL,
  amount_vnd BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','paid','failed','expired') NOT NULL DEFAULT 'pending',
  vnp_transaction_no VARCHAR(40) NULL,
  vnp_bank_code VARCHAR(32) NULL,
  gateway_response VARCHAR(8) NULL,
  expires_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_orders_ref (order_ref),
  KEY idx_payment_orders_user_created (user_id, created_at),
  KEY idx_payment_orders_course_status (course_id, status),
  CONSTRAINT fk_payment_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_payment_orders_course FOREIGN KEY (course_id) REFERENCES courses (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS course_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL,
  payment_order_id BIGINT UNSIGNED NULL,
  status ENUM('active','expired','revoked') NOT NULL DEFAULT 'active',
  starts_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_course_subscription_user_course (user_id, course_id),
  UNIQUE KEY uq_course_subscription_order (payment_order_id),
  KEY idx_course_subscriptions_active (course_id, status, ends_at),
  CONSTRAINT fk_course_subscriptions_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_course_subscriptions_course FOREIGN KEY (course_id) REFERENCES courses (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_course_subscriptions_order FOREIGN KEY (payment_order_id) REFERENCES payment_orders (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS video_assets (
  id CHAR(36) NOT NULL,
  file_name VARCHAR(80) NOT NULL,
  preview_file_name VARCHAR(80) NOT NULL,
  mime_type ENUM('video/mp4','video/webm') NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  duration_seconds DECIMAL(10,3) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_assets_file_name (file_name),
  UNIQUE KEY uq_video_assets_preview_name (preview_file_name),
  CONSTRAINT fk_video_assets_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS learning_documents (
  id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  file_name VARCHAR(80) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_type ENUM('pdf','docx','txt') NOT NULL,
  extracted_text MEDIUMTEXT NULL,
  course_id BIGINT UNSIGNED NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_documents_file (file_name),
  KEY idx_learning_documents_course (course_id, is_published),
  CONSTRAINT fk_learning_documents_course FOREIGN KEY (course_id) REFERENCES courses (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_learning_documents_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS document_progress (
  user_id BIGINT UNSIGNED NOT NULL,
  document_id CHAR(36) NOT NULL,
  page_number INT UNSIGNED NOT NULL DEFAULT 1,
  scroll_ratio DECIMAL(8,6) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, document_id),
  CONSTRAINT fk_document_progress_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_document_progress_document FOREIGN KEY (document_id) REFERENCES learning_documents (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS learner_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL,
  message VARCHAR(1200) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learner_feedback_user_course (user_id, course_id),
  KEY idx_learner_feedback_status (status, is_verified, created_at),
  CONSTRAINT fk_learner_feedback_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_learner_feedback_course FOREIGN KEY (course_id) REFERENCES courses (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
