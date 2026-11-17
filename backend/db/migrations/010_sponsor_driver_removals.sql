CREATE TABLE IF NOT EXISTS sponsor_driver_removals (
  removal_id INT NOT NULL AUTO_INCREMENT,
  driver_user_id INT NOT NULL,
  sponsor_id INT NOT NULL,
  removed_by INT NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (removal_id),
  KEY idx_sponsor_driver_removals_driver (driver_user_id, created_at),
  KEY idx_sponsor_driver_removals_sponsor (sponsor_id, created_at),
  CONSTRAINT fk_sponsor_driver_removals_driver FOREIGN KEY (driver_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_sponsor_driver_removals_sponsor FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id),
  CONSTRAINT fk_sponsor_driver_removals_actor FOREIGN KEY (removed_by) REFERENCES users(user_id)
) ENGINE=InnoDB;
