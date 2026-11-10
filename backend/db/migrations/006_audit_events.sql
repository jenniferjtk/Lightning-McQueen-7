CREATE TABLE IF NOT EXISTS audit_events (
  event_id BIGINT NOT NULL AUTO_INCREMENT,
  category ENUM('driver_application', 'password_change', 'login_attempt') NOT NULL,
  sponsor_id INT NULL,
  actor_user_id INT NULL,
  affected_user_id INT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NULL,
  reason VARCHAR(500) NULL,
  change_type VARCHAR(50) NULL,
  username VARCHAR(255) NULL,
  success BOOLEAN NULL,
  PRIMARY KEY (event_id),
  INDEX idx_audit_events_category_date (category, occurred_at),
  INDEX idx_audit_events_driver_date (affected_user_id, occurred_at),
  INDEX idx_audit_events_sponsor_date (sponsor_id, occurred_at)
);
