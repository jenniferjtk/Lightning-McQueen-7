ALTER TABLE users
  ADD COLUMN sponsor_id INT NULL,
  ADD CONSTRAINT fk_users_sponsor
    FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id);