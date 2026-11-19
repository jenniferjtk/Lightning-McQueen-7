-- Optional phone number on every account, edited on the Account page.
-- Apply to Team07_DB before deploying the code that reads it; only the
-- Account page uses it, so login keeps working if this hasn't run yet.
ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL AFTER last_name;
