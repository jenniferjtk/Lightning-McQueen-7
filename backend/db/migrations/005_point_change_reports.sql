CREATE TABLE IF NOT EXISTS `Team07_DB`.`point_change_reports` (
  `report_id` INT NOT NULL AUTO_INCREMENT,
  `reporter_id` INT NOT NULL,
  `reporter_role` ENUM('driver', 'sponsor') NOT NULL,
  `point_log_id` INT NOT NULL,
  `affected_user_id` INT NOT NULL,
  `description` VARCHAR(45) NOT NULL,
  `pt_value` INT NOT NULL,
  `details` VARCHAR(1000) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `uq_point_change_reporter` (`reporter_id`, `point_log_id`),
  KEY `idx_point_change_reports_created` (`created_at`)
);
