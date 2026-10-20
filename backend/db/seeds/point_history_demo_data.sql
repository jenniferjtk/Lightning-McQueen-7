-- DEMO DATA ONLY, not production data. Gives driver.test@example.com a few
-- weeks of point history so the dashboard point charts (stories 23934, 23935,
-- 23992) have something to render.
--
-- Run AFTER migrations/pt_management.sql and seeds/sponsor_review_test_data.sql.
-- Safe to re-run: rules are skipped if they already exist, and the log rows are
-- skipped if this driver already has any rows tagged 'demo seed'.
--
-- Points come from sponsor_rules (pt_value, description) applied through
-- point_audit_log, awarded by the Acme test sponsor (sponsor_id 1).

INSERT INTO sponsor_rules (sponsor_id, pt_value, description, frequency)
SELECT d.sponsor_id, d.pt_value, d.description, d.frequency
FROM (
  SELECT 1 AS sponsor_id, 50 AS pt_value, 'Safe driving week' AS description, 'recurring' AS frequency
  UNION ALL SELECT 1, 25, 'On-time delivery', 'recurring'
  UNION ALL SELECT 1, 15, 'Clean vehicle inspection', 'recurring'
  UNION ALL SELECT 1, 100, 'Accident-free quarter', 'recurring'
  UNION ALL SELECT 1, -30, 'Speeding alert', 'recurring'
  UNION ALL SELECT 1, -20, 'Late delivery', 'recurring'
  UNION ALL SELECT 1, -40, 'Hard braking event', 'recurring'
) d
WHERE NOT EXISTS (
  SELECT 1 FROM sponsor_rules r WHERE r.sponsor_id = d.sponsor_id AND r.description = d.description
);

INSERT INTO point_audit_log (actor_id, sponsor_rule_id, affected_user_id, timestamp, comment)
SELECT actor.user_id, r.rule_id, driver.user_id, DATE_SUB(CURDATE(), INTERVAL e.days_ago DAY), 'demo seed'
FROM (
  SELECT 'Safe driving week' AS description, 42 AS days_ago
  UNION ALL SELECT 'On-time delivery', 40
  UNION ALL SELECT 'Speeding alert', 38
  UNION ALL SELECT 'On-time delivery', 35
  UNION ALL SELECT 'Safe driving week', 35
  UNION ALL SELECT 'Late delivery', 31
  UNION ALL SELECT 'Clean vehicle inspection', 28
  UNION ALL SELECT 'Safe driving week', 28
  UNION ALL SELECT 'Hard braking event', 24
  UNION ALL SELECT 'On-time delivery', 21
  UNION ALL SELECT 'Safe driving week', 21
  UNION ALL SELECT 'Speeding alert', 17
  UNION ALL SELECT 'On-time delivery', 14
  UNION ALL SELECT 'Safe driving week', 14
  UNION ALL SELECT 'Clean vehicle inspection', 10
  UNION ALL SELECT 'Accident-free quarter', 7
  UNION ALL SELECT 'Safe driving week', 7
  UNION ALL SELECT 'Late delivery', 4
  UNION ALL SELECT 'On-time delivery', 2
) e
JOIN sponsor_rules r ON r.sponsor_id = 1 AND r.description = e.description
JOIN users driver ON driver.email = 'driver.test@example.com'
JOIN users actor ON actor.email = 'sponsor.test@example.com'
WHERE NOT EXISTS (
  SELECT 1 FROM point_audit_log l WHERE l.affected_user_id = driver.user_id AND l.comment = 'demo seed'
);
