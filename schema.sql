-- Sudha Wellness - MySQL schema
-- Run against your MySQL server to create the database and tables:
--   mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS sudha_wellness CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sudha_wellness;

CREATE TABLE IF NOT EXISTS categories (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(255) NOT NULL,
    slug  VARCHAR(255) NOT NULL UNIQUE,
    image VARCHAR(500) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    category_id INT NOT NULL,
    mrp         DOUBLE NOT NULL DEFAULT 0,
    price       DOUBLE NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    image       VARCHAR(500) NOT NULL DEFAULT '',
    stock       INT NOT NULL DEFAULT 100,
    bestseller  TINYINT(1) NOT NULL DEFAULT 0,
    status      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    phone      VARCHAR(50) NOT NULL DEFAULT '',
    address    TEXT NOT NULL,
    items      JSON NOT NULL,
    total      DOUBLE NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;