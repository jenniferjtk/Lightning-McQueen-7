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
