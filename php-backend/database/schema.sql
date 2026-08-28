CREATE DATABASE IF NOT EXISTS specifyu_attendance_hub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE specifyu_attendance_hub;
-- ── Companies ────────────────────────────────────────────────
CREATE TABLE companies (
  id             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  slug           VARCHAR(100) NOT NULL UNIQUE,
  username       VARCHAR(100) NOT NULL UNIQUE,       -- used for login
  email          VARCHAR(255) DEFAULT NULL,          -- optional, for notifications
  password_hash  VARCHAR(255) NOT NULL,
  logo_path      VARCHAR(500) DEFAULT NULL,
  cover_image    VARCHAR(500) DEFAULT NULL,
  description    TEXT         DEFAULT NULL,
  primary_color  VARCHAR(7)   DEFAULT '#d97706',
  member_type    ENUM('student','employee','both') DEFAULT 'student',
  plan           ENUM('free','pro')         DEFAULT 'free',
  is_active      TINYINT(1)   DEFAULT 1,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ⚠️  If upgrading an EXISTING database, run this instead of re-importing:
-- ALTER TABLE companies
--   ADD COLUMN username VARCHAR(100) UNIQUE AFTER slug,
--   MODIFY COLUMN email VARCHAR(255) DEFAULT NULL,
--   MODIFY COLUMN member_type ENUM('student','employee','both') DEFAULT 'student';

-- ── Company Settings ─────────────────────────────────────────
CREATE TABLE company_settings (
  id                            INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id                    INT           NOT NULL UNIQUE,
  -- Student-facing bot
  telegram_bot_token            VARCHAR(255)  DEFAULT NULL,
  telegram_chat_id              VARCHAR(100)  DEFAULT NULL,
  telegram_topic_present        INT           DEFAULT NULL,
  telegram_topic_absent         INT           DEFAULT NULL,
  telegram_topic_permission     INT           DEFAULT NULL,
  telegram_topic_receipt        INT           DEFAULT NULL,
  -- Admin bot
  admin_bot_token               VARCHAR(255)  DEFAULT NULL,
  admin_bot_admins              TEXT          DEFAULT NULL,
  -- GPS
  class_lat                     DECIMAL(12,8) DEFAULT NULL,
  class_lng                     DECIMAL(12,8) DEFAULT NULL,
  max_distance_meters           INT           DEFAULT 400,
  disable_gps_check             TINYINT(1)    DEFAULT 0,
  -- Time window (24h HH:MM format)
  attendance_window_start       VARCHAR(10)   DEFAULT '23:30',
  attendance_window_end         VARCHAR(10)   DEFAULT '02:30',
  class_days                    VARCHAR(20)   DEFAULT '1,3,5',
  allow_offtime_submission      TINYINT(1)    DEFAULT 0,
  allow_multiple_submissions    TINYINT(1)    DEFAULT 0,
  -- Google Sheets
  enable_google_sheets          TINYINT(1)    DEFAULT 0,
  google_sheet_id               VARCHAR(255)  DEFAULT NULL,
  google_sheet_tab              VARCHAR(255)  DEFAULT NULL,
  google_sheet_branches         VARCHAR(500)  DEFAULT NULL,
  google_sheet_levels           VARCHAR(500)  DEFAULT NULL,
  google_service_account_json   LONGTEXT      DEFAULT NULL,
  -- Receipt upload
  enable_receipt_upload         TINYINT(1)    DEFAULT 0,
  -- Cron
  cron_secret                   VARCHAR(255)  DEFAULT NULL,
  enable_cron                   TINYINT(1)    DEFAULT 1,
  -- Mini app URL (set after registration)
  webapp_url                    VARCHAR(500)  DEFAULT NULL,
  updated_at                    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Members ──────────────────────────────────────────────────
CREATE TABLE members (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id    INT          NOT NULL,
  name          VARCHAR(255) NOT NULL,
  english_name  VARCHAR(255) DEFAULT NULL,
  group_name    VARCHAR(100) DEFAULT NULL,
  branch_id     INT          DEFAULT NULL,
  level_id      INT          DEFAULT NULL,
  member_type   ENUM('student','employee') DEFAULT 'student',
  is_active     TINYINT(1)   DEFAULT 1,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_company (company_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Attendance Records ───────────────────────────────────────
CREATE TABLE attendance_records (
  id                INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id        INT           NOT NULL,
  member_id         INT           DEFAULT NULL,
  member_name       VARCHAR(255)  NOT NULL,
  group_name        VARCHAR(100)  DEFAULT NULL,
  branch_name       VARCHAR(255)  DEFAULT NULL,
  level_name        VARCHAR(255)  DEFAULT NULL,
  status            ENUM('present','permission') NOT NULL,
  reason            TEXT          DEFAULT NULL,
  latitude          DECIMAL(12,8) DEFAULT NULL,
  longitude         DECIMAL(12,8) DEFAULT NULL,
  eth_date          VARCHAR(100)  NOT NULL,
  eth_time          VARCHAR(50)   DEFAULT NULL,
  submitted_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  is_admin_override TINYINT(1)    DEFAULT 0,
  INDEX idx_company_date (company_id, eth_date),
  INDEX idx_member (member_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Receipt Uploads ──────────────────────────────────────────
CREATE TABLE receipt_uploads (
  id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id          INT          NOT NULL,
  payer_name          VARCHAR(255) NOT NULL,
  student_name        VARCHAR(255) NOT NULL,
  file_path           VARCHAR(500) NOT NULL,
  telegram_message_id VARCHAR(100) DEFAULT NULL,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_company (company_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Branches ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id    INT          NOT NULL,
  name          VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_branch_company (company_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Levels ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS levels (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id    INT          NOT NULL,
  name          VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_level_company (company_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ⚠️  If upgrading an EXISTING database, run these ALTER statements:
-- ALTER TABLE company_settings ADD COLUMN google_sheet_tab VARCHAR(255) DEFAULT NULL AFTER google_sheet_id;
-- ALTER TABLE company_settings ADD COLUMN google_sheet_branches VARCHAR(500) DEFAULT NULL AFTER google_sheet_tab;
-- ALTER TABLE company_settings ADD COLUMN google_sheet_levels VARCHAR(500) DEFAULT NULL AFTER google_sheet_branches;
-- ALTER TABLE company_settings ADD COLUMN webapp_branches VARCHAR(500) DEFAULT NULL AFTER google_sheet_levels;
-- ALTER TABLE company_settings ADD COLUMN webapp_levels VARCHAR(500) DEFAULT NULL AFTER webapp_branches;
-- ALTER TABLE company_settings ADD COLUMN google_sheet_receipt_tab VARCHAR(255) DEFAULT NULL AFTER google_sheet_levels;
-- ALTER TABLE members ADD COLUMN branch_id   INT DEFAULT NULL AFTER group_name;
-- ALTER TABLE members ADD COLUMN level_id    INT DEFAULT NULL AFTER branch_id;
-- ALTER TABLE members ADD COLUMN image_path  VARCHAR(500) DEFAULT NULL AFTER level_id;
-- ALTER TABLE attendance_records ADD COLUMN branch_name VARCHAR(255) DEFAULT NULL AFTER group_name;
-- ALTER TABLE attendance_records ADD COLUMN level_name  VARCHAR(255) DEFAULT NULL AFTER branch_name;

-- ── Dashboard Sessions ───────────────────────────────────────
CREATE TABLE company_sessions (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id    INT          NOT NULL,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  expires_at    TIMESTAMP    NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Super Admin ──────────────────────────────────────────────
CREATE TABLE super_admin (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default super admin credentials:
--   Username : superadmin
--   Password : Admin@SpecificEt2024
--   ⚠️  CHANGE THIS PASSWORD immediately after first login!
INSERT INTO super_admin (username, password_hash) VALUES (
  'superadmin',
  '$2y$12$sBZ9QHp6hDznw0rjL460GeEnydg6jbZdmhfjWTGF8RirA8UHAk..m'
);

-- ── System Config (super-admin settings: default bot token, etc.) ───────
CREATE TABLE IF NOT EXISTS system_config (
  config_key   VARCHAR(100) PRIMARY KEY,
  config_value TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
