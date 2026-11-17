ALTER TABLE users
  ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER sponsor_id,
  ADD COLUMN suspended_until DATETIME NULL AFTER account_status;
