ALTER TABLE sponsors
  ADD COLUMN sponsor_user_id INT NULL,
  ADD UNIQUE KEY uq_sponsors_sponsor_user_id (sponsor_user_id),
  ADD CONSTRAINT fk_sponsors_sponsor_user
    FOREIGN KEY (sponsor_user_id) REFERENCES users(user_id);