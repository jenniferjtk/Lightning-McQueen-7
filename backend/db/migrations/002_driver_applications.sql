CREATE TABLE IF NOT EXISTS sponsors (
    sponsor_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    point_conversion_rate DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS driver_applications (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    driver_user_id INT NOT NULL,
    sponsor_id INT NOT NULL,
    status ENUM('pending','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP NULL,
    FOREIGN KEY (driver_user_id) REFERENCES users(user_id),
    FOREIGN KEY (sponsor_id) REFERENCES sponsors(sponsor_id)
);

-- Minimal seed data so the create-application flow is actually testable —
-- real sponsor onboarding is a separate, future story.
INSERT INTO sponsors (name, description, point_conversion_rate) VALUES
  ('Acme Trucking', 'Test sponsor for development', 1.0000),
  ('Roadrunner Logistics', 'Test sponsor for development', 0.8000);
