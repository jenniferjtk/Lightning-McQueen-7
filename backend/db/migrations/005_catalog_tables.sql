-- Product catalog (stories 27791, 27801, 27805).
--
-- cached_products: local copy of the Fake Store product list. Catalog
-- browsing and search read from here; the API refetches the whole list when
-- the oldest row is older than CATALOG_CACHE_TTL_MINUTES, and re-fetches a
-- single product live before checkout. product_id is the provider's own id.
--
-- sponsor_catalog: the subset of cached products each sponsor organization
-- offers its drivers. Each sponsor curates its own rows; two sponsors can pick
-- overlapping or completely different products. category_tag is the sponsor's
-- own label for the product (NULL means "use the provider's category").
CREATE TABLE IF NOT EXISTS cached_products (
  product_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT '',
  image_url VARCHAR(500) NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sponsor_catalog (
  sponsor_id INT NOT NULL,
  product_id INT NOT NULL,
  category_tag VARCHAR(100) NULL,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sponsor_id, product_id),
  KEY idx_sponsor_catalog_product (product_id),
  CONSTRAINT fk_sponsor_catalog_sponsor FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id),
  CONSTRAINT fk_sponsor_catalog_product FOREIGN KEY (product_id) REFERENCES cached_products(product_id)
) ENGINE=InnoDB;
