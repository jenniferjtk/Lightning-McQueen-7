CREATE TABLE IF NOT EXISTS driver_notifications (
  notification_id INT NOT NULL AUTO_INCREMENT,
  driver_user_id INT NOT NULL,
  sponsor_id INT NOT NULL,
  notification_type ENUM('application_approved', 'sponsor_dropped') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  PRIMARY KEY (notification_id),
  KEY idx_driver_notifications_unread (driver_user_id, read_at, created_at),
  CONSTRAINT fk_driver_notifications_driver FOREIGN KEY (driver_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_driver_notifications_sponsor FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id)
) ENGINE=InnoDB;
