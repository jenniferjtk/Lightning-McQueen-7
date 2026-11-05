ALTER TABLE users
  ADD COLUMN shipping_address VARCHAR(255) NULL,
  ADD COLUMN shipping_city VARCHAR(100) NULL,
  ADD COLUMN shipping_state VARCHAR(100) NULL,
  ADD COLUMN shipping_postal_code VARCHAR(20) NULL,
  ADD COLUMN shipping_country VARCHAR(100) NULL;

ALTER TABLE sponsor_catalog
  ADD COLUMN stock_quantity INT UNSIGNED NULL DEFAULT NULL;