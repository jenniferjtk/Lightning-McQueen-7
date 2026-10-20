-- DEMO DATA ONLY, not production data. Shows that each sponsor curates its own
-- catalog from the same Fake Store product list (stories 27801, 27805):
--   Acme Trucking (sponsor_id 1)        electronics, a backpack, and a jacket
--   Roadrunner Logistics (sponsor_id 2) jewelry, women's jackets, and the
--                                       same backpack under a different tag
-- and that a driver with two sponsors sees a different catalog for each.
--
-- Run AFTER migrations/005_catalog_tables.sql and seeds/sponsor_review_test_data.sql.
-- Safe to re-run: every insert is skipped if its row already exists.
--
-- Test logins (development only, not real accounts). Same shared password as
-- the other test users, stored as TEST_USER_PASSWORD in backend/.env.
--   sponsor.test@example.com   role=sponsor, Acme Trucking (from sponsor_review_test_data.sql)
--   sponsor2.test@example.com  role=sponsor, Roadrunner Logistics (added here)
--   driver.test@example.com    role=driver, approved by BOTH sponsors (set here)

-- A snapshot of the Fake Store products used below, so sponsor_catalog's
-- foreign key is satisfied before the app has fetched anything. fetched_at is
-- set far in the past, so the first catalog request refreshes every row
-- (including descriptions) from Fake Store.
INSERT INTO cached_products (product_id, title, price, description, category, image_url, fetched_at)
SELECT d.product_id, d.title, d.price, '', d.category, d.image_url, '2000-01-01 00:00:00'
FROM (
  SELECT 1 AS product_id, 'Fjallraven - Foldsack No. 1 Backpack, Fits 15 Laptops' AS title, 109.95 AS price, 'men''s clothing' AS category, 'https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_t.png' AS image_url
  UNION ALL SELECT 3, 'Mens Cotton Jacket', 55.99, 'men''s clothing', 'https://fakestoreapi.com/img/71li-ujtlUL._AC_UX679_t.png'
  UNION ALL SELECT 5, 'John Hardy Women''s Legends Naga Gold & Silver Dragon Station Chain Bracelet', 695.00, 'jewelery', 'https://fakestoreapi.com/img/71pWzhdJNwL._AC_UL640_QL65_ML3_t.png'
  UNION ALL SELECT 6, 'Solid Gold Petite Micropave ', 168.00, 'jewelery', 'https://fakestoreapi.com/img/61sbMiUnoGL._AC_UL640_QL65_ML3_t.png'
  UNION ALL SELECT 9, 'WD 2TB Elements Portable External Hard Drive - USB 3.0 ', 64.00, 'electronics', 'https://fakestoreapi.com/img/61IBBVJvSDL._AC_SY879_t.png'
  UNION ALL SELECT 10, 'SanDisk SSD PLUS 1TB Internal SSD - SATA III 6 Gb/s', 109.00, 'electronics', 'https://fakestoreapi.com/img/61U7T1koQqL._AC_SX679_t.png'
  UNION ALL SELECT 13, 'Acer SB220Q bi 21.5 inches Full HD (1920 x 1080) IPS Ultra-Thin', 599.00, 'electronics', 'https://fakestoreapi.com/img/81QpkIctqPL._AC_SX679_t.png'
  UNION ALL SELECT 15, 'BIYLACLESEN Women''s 3-in-1 Snowboard Jacket Winter Coats', 56.99, 'women''s clothing', 'https://fakestoreapi.com/img/51Y5NI-I5jL._AC_UX679_t.png'
  UNION ALL SELECT 17, 'Rain Jacket Women Windbreaker Striped Climbing Raincoats', 39.99, 'women''s clothing', 'https://fakestoreapi.com/img/71HblAHs5xL._AC_UY879_-2t.png'
) d
WHERE NOT EXISTS (SELECT 1 FROM cached_products p WHERE p.product_id = d.product_id);

INSERT INTO sponsor_catalog (sponsor_id, product_id, category_tag)
SELECT d.sponsor_id, d.product_id, d.category_tag
FROM (
  SELECT 1 AS sponsor_id, 9 AS product_id, 'Cab tech' AS category_tag
  UNION ALL SELECT 1, 10, 'Cab tech'
  UNION ALL SELECT 1, 13, 'Cab tech'
  UNION ALL SELECT 1, 1, 'On the road'
  UNION ALL SELECT 1, 3, NULL
  UNION ALL SELECT 2, 5, 'Milestone rewards'
  UNION ALL SELECT 2, 6, 'Milestone rewards'
  UNION ALL SELECT 2, 15, 'Cold-weather gear'
  UNION ALL SELECT 2, 17, 'Cold-weather gear'
  UNION ALL SELECT 2, 1, 'Travel'
) d
WHERE NOT EXISTS (
  SELECT 1 FROM sponsor_catalog c WHERE c.sponsor_id = d.sponsor_id AND c.product_id = d.product_id
);

INSERT INTO users (email, password_hash, role, first_name, last_name, sponsor_id)
SELECT 'sponsor2.test@example.com', '$2b$10$pHRmSMs.2.tztZbOALuR4ud2ebu3IJfXdVGQ6dAlKT6QrQz27IGOK', 'sponsor', 'Test', 'Roadrunner', 2
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'sponsor2.test@example.com');

-- driver.test approved by both sponsors. Adds an approved application only
-- where the driver has no pending or approved one with that sponsor, then
-- approves any pending one (sponsor_review_test_data.sql leaves a pending
-- application to Roadrunner).
INSERT INTO driver_applications (driver_user_id, sponsor_id, status, decided_at)
SELECT u.user_id, s.sponsor_id, 'approved', NOW()
FROM users u
JOIN sponsors s ON s.sponsor_id IN (1, 2)
WHERE u.email = 'driver.test@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM driver_applications a
    WHERE a.driver_user_id = u.user_id AND a.sponsor_id = s.sponsor_id AND a.status IN ('pending', 'approved')
  );

UPDATE driver_applications a
JOIN users u ON u.user_id = a.driver_user_id
SET a.status = 'approved', a.decided_at = NOW()
WHERE u.email = 'driver.test@example.com' AND a.sponsor_id IN (1, 2) AND a.status = 'pending';
