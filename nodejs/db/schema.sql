/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

-- Dumping database structure for funnode
CREATE DATABASE IF NOT EXISTS `funnode` /*!40100 DEFAULT CHARACTER SET utf8 */;
USE `funnode`;

-- Dumping structure for table funnode.games
CREATE TABLE IF NOT EXISTS `games` (
  `id` int(2) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(32) NOT NULL,
  `url` varchar(32) NOT NULL,
  `port` int(6) NOT NULL DEFAULT '0',
  `difficulty` tinyint(1) NOT NULL DEFAULT '2',
  `description` varchar(1024) NOT NULL DEFAULT '',
  `keywords` varchar(128) NOT NULL DEFAULT '',
  `players` varchar(8) NOT NULL DEFAULT '2',
  `timers` varchar(16) NOT NULL DEFAULT '30:0:60:1',
  `timersi` varchar(16) NOT NULL DEFAULT '5:0:10:1',
  `timersb` varchar(16) NOT NULL DEFAULT '30:0:60:1',
  `mobile` tinyint(1) NOT NULL DEFAULT '0',
  `status` tinyint(1) NOT NULL DEFAULT '-1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `url_index` (`url`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `port` (`port`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.game_ais
CREATE TABLE IF NOT EXISTS `game_ais` (
  `id` int(2) unsigned NOT NULL AUTO_INCREMENT,
  `game_id` int(2) unsigned NOT NULL,
  `name` varchar(32) NOT NULL,
  `rating` varchar(64) NOT NULL DEFAULT '1100:1:1:50',
  `certainty` decimal(7,3) NOT NULL DEFAULT '0.950',
  `pause_time` int(4) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_id_name` (`game_id`,`name`),
  KEY `game_id` (`game_id`),
  CONSTRAINT `ais_game_id` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.game_settings
CREATE TABLE IF NOT EXISTS `game_settings` (
  `game_id` int(2) unsigned NOT NULL,
  `audio` tinyint(1) NOT NULL DEFAULT '0',
  `colours` tinyint(1) NOT NULL DEFAULT '0',
  `ladder` tinyint(1) NOT NULL DEFAULT '0',
  `layout` tinyint(1) NOT NULL DEFAULT '0',
  `review` tinyint(1) NOT NULL DEFAULT '0',
  UNIQUE KEY `game_id` (`game_id`),
  CONSTRAINT `settings_game_id` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.game_stats
CREATE TABLE IF NOT EXISTS `game_stats` (
  `game_id` int(2) unsigned NOT NULL DEFAULT '0',
  `matches` int(4) unsigned NOT NULL DEFAULT '0',
  `players` int(4) unsigned NOT NULL DEFAULT '0',
  `date` bigint(20) NOT NULL,
  KEY `game_id` (`game_id`),
  CONSTRAINT `FK_game_stats_games` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.game_types
CREATE TABLE IF NOT EXISTS `game_types` (
  `id` int(4) unsigned NOT NULL AUTO_INCREMENT,
  `game_id` int(2) unsigned NOT NULL,
  `type` enum('board','card','dice') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_id_type` (`game_id`,`type`),
  KEY `game_id` (`game_id`),
  CONSTRAINT `FK__games` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.matches
CREATE TABLE IF NOT EXISTS `matches` (
  `id` int(8) unsigned NOT NULL AUTO_INCREMENT,
  `chat_id` varchar(16) DEFAULT NULL,
  `game_id` int(2) unsigned DEFAULT NULL,
  `type` enum('STANDARD','LADDER','PRIVATE') NOT NULL DEFAULT 'STANDARD',
  `rated` tinyint(1) NOT NULL DEFAULT '1',
  `players` varchar(256) NOT NULL,
  `start` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finish` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `decision` enum('CANCELLED','IN_PROGRESS','COMPLETE') NOT NULL DEFAULT 'IN_PROGRESS',
  PRIMARY KEY (`id`),
  KEY `game_id` (`game_id`),
  CONSTRAINT `FK_matches_games` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.match_players
CREATE TABLE IF NOT EXISTS `match_players` (
  `id` int(8) unsigned NOT NULL AUTO_INCREMENT,
  `match_id` int(8) unsigned NOT NULL,
  `player_id` int(8) unsigned NOT NULL,
  `place` decimal(4,2) DEFAULT NULL,
  `rating` decimal(7,3) DEFAULT NULL,
  `certainty` decimal(7,3) DEFAULT NULL,
  `ladder` int(8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `match_id` (`match_id`),
  KEY `player_id` (`player_id`),
  CONSTRAINT `match_player_id` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `matches_players_match_id` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.players
CREATE TABLE IF NOT EXISTS `players` (
  `id` int(8) unsigned NOT NULL AUTO_INCREMENT,
  `facebook_id` bigint(12) DEFAULT NULL,
  `name` varchar(32) NOT NULL,
  `pass` blob,
  `email` varchar(64) DEFAULT NULL,
  `image` varchar(32) DEFAULT NULL,
  `image_date` timestamp NULL DEFAULT NULL,
  `key` int(11) NOT NULL,
  `date_registered` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_signedin` timestamp NULL DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `facebook_id` (`facebook_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.player_ratings
CREATE TABLE IF NOT EXISTS `player_ratings` (
  `id` int(8) unsigned NOT NULL AUTO_INCREMENT,
  `player_id` int(8) unsigned NOT NULL,
  `game_id` int(2) unsigned NOT NULL,
  `rating` decimal(7,3) NOT NULL DEFAULT '0.000',
  `certainty` decimal(7,3) NOT NULL DEFAULT '0.000',
  `ladder` int(8) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `player_id_game_id` (`player_id`,`game_id`),
  KEY `player_id` (`player_id`),
  KEY `game_id` (`game_id`),
  CONSTRAINT `ratings_game_id` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ratings_player_id` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Dumping structure for table funnode.player_ratings_provisional
CREATE TABLE IF NOT EXISTS `player_ratings_provisional` (
  `id` int(8) unsigned NOT NULL AUTO_INCREMENT,
  `player_id` int(8) unsigned NOT NULL,
  `game_id` int(2) unsigned NOT NULL,
  `rating` decimal(9,3) NOT NULL DEFAULT '0.000',
  `certainty` decimal(9,3) NOT NULL DEFAULT '0.000',
  `played` int(2) unsigned NOT NULL DEFAULT '0',
  `won` int(2) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `player_id_game_id` (`player_id`,`game_id`),
  KEY `player_id` (`player_id`),
  KEY `game_id` (`game_id`),
  CONSTRAINT `player_ratings_provisional_game_id` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `player_ratings_provisional_player_id` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=COMPACT;

/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IF(@OLD_FOREIGN_KEY_CHECKS IS NULL, 1, @OLD_FOREIGN_KEY_CHECKS) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
