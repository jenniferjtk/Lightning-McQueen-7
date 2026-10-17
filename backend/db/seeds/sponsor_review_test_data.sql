-- Test data for sponsor application review (stories 24339, 24982, 24992).
-- Run AFTER migrations/003_sponsor_id_on_users.sql. Safe to re-run: every
-- insert is skipped if its row already exists.
--
-- Test logins (development only — not real accounts). Both share one password,
-- stored as TEST_USER_PASSWORD in backend/.env (gitignored; ask Jennifer for it).
--   sponsor.test@example.com  role=sponsor, linked to Acme Trucking (sponsor_id 1)
--   driver.test@example.com   role=driver, has one pending application to
--                             Roadrunner Logistics (sponsor_id 2), which the Acme
--                             test sponsor must NOT be able to decide (403 check).

INSERT INTO users (email, password_hash, role, first_name, last_name, sponsor_id)
SELECT 'sponsor.test@example.com', '$2b$10$pHRmSMs.2.tztZbOALuR4ud2ebu3IJfXdVGQ6dAlKT6QrQz27IGOK', 'sponsor', 'Test', 'Sponsor', 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'sponsor.test@example.com');

INSERT INTO users (email, password_hash, role, first_name, last_name)
SELECT 'driver.test@example.com', '$2b$10$pHRmSMs.2.tztZbOALuR4ud2ebu3IJfXdVGQ6dAlKT6QrQz27IGOK', 'driver', 'Test', 'Driver'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'driver.test@example.com');

INSERT INTO driver_applications (driver_user_id, sponsor_id, status)
SELECT u.user_id, 2, 'pending'
FROM users u
WHERE u.email = 'driver.test@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM driver_applications a
    WHERE a.driver_user_id = u.user_id AND a.sponsor_id = 2
  );
