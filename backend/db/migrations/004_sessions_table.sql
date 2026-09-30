-- Session store for the Express app when it runs on Lambda (express-mysql-session).
-- Schema matches the library's own schema.sql; the app is configured with
-- createDatabaseTable: false so this file is the only thing that creates it.
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB;
