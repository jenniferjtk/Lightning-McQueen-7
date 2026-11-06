-- Driver orders from a sponsor catalog (stories 24981, 25063, 23918, 25044, 25045).
--
-- One row per redeemed item. The product title, dollar price, point cost and
-- shipping address are copied at checkout, so later catalog price changes or
-- address edits don't rewrite past orders.
--
-- A driver's spendable balance with a sponsor is the points that sponsor's
-- rules awarded (point_audit_log) minus point_cost of that driver's orders
-- with the sponsor that aren't canceled. Canceling an order (status
-- 'canceled') therefore returns its points without a separate refund row.
CREATE TABLE IF NOT EXISTS orders (
  order_id INT NOT NULL AUTO_INCREMENT,
  driver_user_id INT NOT NULL,
  sponsor_id INT NOT NULL,
  product_id INT NOT NULL,
  product_title VARCHAR(255) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  point_cost INT UNSIGNED NOT NULL,
  status ENUM('pending', 'shipped', 'delivered', 'canceled') NOT NULL DEFAULT 'pending',
  shipping_address VARCHAR(255) NOT NULL,
  shipping_city VARCHAR(100) NOT NULL,
  shipping_state VARCHAR(100) NULL,
  shipping_postal_code VARCHAR(20) NOT NULL,
  shipping_country VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  KEY idx_orders_driver_sponsor (driver_user_id, sponsor_id),
  CONSTRAINT fk_orders_driver FOREIGN KEY (driver_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_orders_sponsor FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id),
  CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES cached_products(product_id)
) ENGINE=InnoDB;
