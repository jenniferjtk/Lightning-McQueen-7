CREATE TABLE IF NOT EXISTS `Team07_DB`.`sponsor_rules` (
  `rule_id` INT NOT NULL AUTO_INCREMENT,
  `sponsor_id` INT NULL,
  `pt_value` INT NOT NULL DEFAULT '1',
  `description` VARCHAR(45) NULL,
  `frequency` VARCHAR(45) NULL,
  PRIMARY KEY (`rule_id`));


INSERT INTO `Team07_DB`.`sponsor_rules` (
    `rule_id`, `sponsor_id`, `pt_value`, `description`, `frequency`
    ) VALUES (
        '1', '1', '1', '\'Full stop at stop signs\'', '\'recurring\''
        );


CREATE TABLE `Team07_DB`.`audit_log` (
  `log_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `action` VARCHAR(45) NOT NULL,
  `reason` VARCHAR(45) NULL,
  `affected_user_id` INT NULL,
  `timestamp` VARCHAR(45) NULL,
  PRIMARY KEY (`log_id`));


ALTER TABLE `Team07_DB`.`audit_log` 
DROP COLUMN `reason`,
DROP COLUMN `action`,
ADD COLUMN `sponsor_rule_id` INT NOT NULL AFTER `actor_id`,
ADD COLUMN `comment` VARCHAR(45) NULL AFTER `timestamp`,
CHANGE COLUMN `user_id` `actor_id` INT NOT NULL ,
CHANGE COLUMN `affected_user_id` `affected_user_id` INT NOT NULL ,
CHANGE COLUMN `timestamp` `timestamp` DATE NOT NULL , RENAME TO  `Team07_DB`.`point_audit_log` ;

INSERT INTO `Team07_DB`.`point_audit_log` (`log_id`, `actor_id`, `sponsor_rule_id`, `affected_user_id`, `timestamp`, `comment`) VALUES ('1', '5', '1', '1', '09-29-2026', '\'test\'');
