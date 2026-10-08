-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;

DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
LOCK TABLES `roles` WRITE;
INSERT INTO `roles` VALUES (1,'admin'),(2,'user'),(3,'guest');
UNLOCK TABLES;

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `users` VALUES (1,'owner','hash-owner',1,'2024-01-02 03:04:05'),(2,'guest','hash-guest',3,'2024-01-02 03:04:05');

DROP TABLE IF EXISTS `fineness_levels`;
CREATE TABLE `fineness_levels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `fineness_levels` VALUES (1,'coarse'),(2,'medium'),(3,'fine');

DROP TABLE IF EXISTS `components`;
CREATE TABLE `components` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `fineness_id` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `components` VALUES (1,'Perlite',1),(2,'Owner\'s mix',3);

DROP TABLE IF EXISTS `fertilizer_types`;
CREATE TABLE `fertilizer_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `fertilizer_types` VALUES (1,'organic'),(2,'synthetic');

DROP TABLE IF EXISTS `substrates`;
CREATE TABLE `substrates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `user_id` int NOT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `substrates` VALUES (1,'Airy mix',1,1,'2024-02-01 00:00:00');

DROP TABLE IF EXISTS `plants`;
CREATE TABLE `plants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `species` varchar(255) DEFAULT NULL,
  `substrate_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `plants` VALUES (1,'Monty','Monstera deliciosa',1,1,1,'2024-03-01 00:00:00'),(2,'Monty II','monstera deliciosa',1,1,0,'2024-03-02 00:00:00'),(3,'Bare',NULL,NULL,1,0,'2024-03-03 00:00:00');

DROP TABLE IF EXISTS `images`;
CREATE TABLE `images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `image_url` varchar(500) NOT NULL,
  `upload_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `images` VALUES (1,'http://h/uploads/a.webp','2024-04-01 00:00:00'),(2,'http://h/uploads/b.webp','2024-04-02 00:00:00');

DROP TABLE IF EXISTS `plant_images`;
CREATE TABLE `plant_images` (
  `plant_id` int NOT NULL,
  `image_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `plant_images` VALUES (1,1);

DROP TABLE IF EXISTS `substrate_images`;
CREATE TABLE `substrate_images` (
  `substrate_id` int NOT NULL,
  `image_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `substrate_images` VALUES (1,2);

DROP TABLE IF EXISTS `component_images`;
CREATE TABLE `component_images` (
  `component_id` int NOT NULL,
  `image_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `substrate_components`;
CREATE TABLE `substrate_components` (
  `substrate_id` int NOT NULL,
  `component_id` int NOT NULL,
  `parts` decimal(5,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `substrate_components` VALUES (1,1,2.50),(1,2,1.00);

DROP TABLE IF EXISTS `watering_records`;
CREATE TABLE `watering_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plant_id` int NOT NULL,
  `date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_fertilizer` tinyint(1) NOT NULL DEFAULT '0',
  `fertilizer_type_id` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO `watering_records` VALUES (1,1,'2024-05-01 08:00:00',1,2);
