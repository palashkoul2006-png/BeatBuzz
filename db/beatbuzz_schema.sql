-- BeatBuzz full database schema: create database, tables, indexes, and triggers
-- Run this script on MySQL 8+ to initialize a clean database

-- Create and select database
CREATE DATABASE IF NOT EXISTS beatbuzz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE beatbuzz;

-- =====================
-- Core Tables
-- =====================

-- User credentials
CREATE TABLE IF NOT EXISTS credentials (
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  confirm_token VARCHAR(255) DEFAULT NULL,
  token_expiry DATETIME DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (username),
  UNIQUE KEY uniq_email (email)
) ENGINE=InnoDB;

-- User profiles (linked by verified email)
CREATE TABLE IF NOT EXISTS profiles (
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  branch VARCHAR(255) NOT NULL,
  clubs_part_of VARCHAR(255) DEFAULT NULL,
  domain VARCHAR(255) DEFAULT NULL,
  position VARCHAR(255) DEFAULT NULL,
  year INT DEFAULT NULL,
  hometown VARCHAR(255) NOT NULL,
  bio VARCHAR(1000) NOT NULL,
  zodiac_sign VARCHAR(64) NOT NULL,
  profile_pic VARCHAR(255) DEFAULT 'default.jpg',
  username VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (email),
  CONSTRAINT fk_profiles_email FOREIGN KEY (email) REFERENCES credentials(email) ON DELETE CASCADE,
  UNIQUE KEY uniq_profiles_username (username)
) ENGINE=InnoDB;

-- Follow connections (vibes)
CREATE TABLE IF NOT EXISTS follows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  follower_username VARCHAR(255) NOT NULL,
  following_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_follows_follower FOREIGN KEY (follower_username) REFERENCES credentials(username) ON DELETE CASCADE,
  CONSTRAINT fk_follows_following FOREIGN KEY (following_username) REFERENCES credentials(username) ON DELETE CASCADE,
  UNIQUE KEY uniq_follow_pair (follower_username, following_username),
  KEY idx_follower (follower_username),
  KEY idx_following (following_username)
) ENGINE=InnoDB;

-- Notifications (for vibes, messages, etc.)
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL, -- recipient
  actor VARCHAR(255) NOT NULL,    -- initiator
  type VARCHAR(32) NOT NULL,      -- e.g., 'vibe', 'message', 'vibe_back'
  message VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  seen TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_notif_user FOREIGN KEY (username) REFERENCES credentials(username) ON DELETE CASCADE,
  CONSTRAINT fk_notif_actor FOREIGN KEY (actor) REFERENCES credentials(username) ON DELETE CASCADE,
  KEY idx_notifications_user (username),
  KEY idx_notifications_seen (username, seen)
) ENGINE=InnoDB;

-- =====================
-- Posts Feature
-- =====================

CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_username VARCHAR(255) NOT NULL,
  image_filename VARCHAR(255) NOT NULL,
  caption VARCHAR(1000),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_posts_author FOREIGN KEY (author_username)
    REFERENCES credentials(username) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  username VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_likes_post FOREIGN KEY (post_id)
    REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (username)
    REFERENCES credentials(username) ON DELETE CASCADE,
  UNIQUE KEY uniq_like (post_id, username),
  KEY idx_likes_post (post_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  username VARCHAR(255) NOT NULL,
  comment_text VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id)
    REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (username)
    REFERENCES credentials(username) ON DELETE CASCADE,
  KEY idx_comments_post (post_id)
) ENGINE=InnoDB;

-- Helpful indexes for posts listing
CREATE INDEX idx_posts_created_at ON posts(created_at);

-- =====================
-- Chat Feature (Direct Messages)
-- =====================

CREATE TABLE IF NOT EXISTS direct_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_username VARCHAR(255) NOT NULL,
  receiver_username VARCHAR(255) NOT NULL,
  message_text VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_dm_sender FOREIGN KEY (sender_username)
    REFERENCES credentials(username) ON DELETE CASCADE,
  CONSTRAINT fk_dm_receiver FOREIGN KEY (receiver_username)
    REFERENCES credentials(username) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_dm_pair_time ON direct_messages(sender_username, receiver_username, created_at);
CREATE INDEX idx_dm_receiver_unread ON direct_messages(receiver_username, is_read);
CREATE INDEX idx_dm_created_at ON direct_messages(created_at);

-- =====================
-- Triggers (Data integrity & sanitization)
-- =====================

DROP TRIGGER IF EXISTS profiles_bi;
DROP TRIGGER IF EXISTS profiles_bu;
DROP TRIGGER IF EXISTS follows_bi;
DROP TRIGGER IF EXISTS notifications_bi;
DROP TRIGGER IF EXISTS notifications_bu;
DROP TRIGGER IF EXISTS posts_bi;
DROP TRIGGER IF EXISTS post_likes_bi;
DROP TRIGGER IF EXISTS post_comments_bi;
DROP TRIGGER IF EXISTS direct_messages_bi;
DROP TRIGGER IF EXISTS direct_messages_bu;

DELIMITER $$

-- Profiles: sanitize text, validate year, ensure verified email, default profile pic
CREATE TRIGGER profiles_bi BEFORE INSERT ON profiles
FOR EACH ROW
BEGIN
  DECLARE v_active INT DEFAULT 0;

  SET NEW.full_name = TRIM(NEW.full_name);
  SET NEW.branch = TRIM(IFNULL(NEW.branch, ''));
  SET NEW.clubs_part_of = TRIM(IFNULL(NEW.clubs_part_of, ''));
  SET NEW.domain = TRIM(IFNULL(NEW.domain, ''));
  SET NEW.position = TRIM(IFNULL(NEW.position, ''));
  SET NEW.hometown = TRIM(IFNULL(NEW.hometown, ''));
  SET NEW.bio = TRIM(IFNULL(NEW.bio, ''));
  SET NEW.zodiac_sign = TRIM(IFNULL(NEW.zodiac_sign, ''));

  IF NEW.year IS NULL OR NEW.year < 1 OR NEW.year > 10 THEN
    SET NEW.year = NULL; -- sanitize unrealistic year
  END IF;

  IF NEW.profile_pic IS NULL OR TRIM(NEW.profile_pic) = '' THEN
    SET NEW.profile_pic = 'default.jpg';
  END IF;

  -- require verified credentials for the email
  SELECT is_active INTO v_active FROM credentials WHERE email = NEW.email LIMIT 1;
  IF v_active IS NULL OR v_active = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Profile email not verified or not found';
  END IF;
END$$

CREATE TRIGGER profiles_bu BEFORE UPDATE ON profiles
FOR EACH ROW
BEGIN
  SET NEW.full_name = TRIM(NEW.full_name);
  SET NEW.branch = TRIM(IFNULL(NEW.branch, ''));
  SET NEW.clubs_part_of = TRIM(IFNULL(NEW.clubs_part_of, ''));
  SET NEW.domain = TRIM(IFNULL(NEW.domain, ''));
  SET NEW.position = TRIM(IFNULL(NEW.position, ''));
  SET NEW.hometown = TRIM(IFNULL(NEW.hometown, ''));
  SET NEW.bio = TRIM(IFNULL(NEW.bio, ''));
  SET NEW.zodiac_sign = TRIM(IFNULL(NEW.zodiac_sign, ''));

  IF NEW.year IS NULL OR NEW.year < 1 OR NEW.year > 10 THEN
    SET NEW.year = NULL; -- sanitize unrealistic year
  END IF;

  IF NEW.profile_pic IS NULL OR TRIM(NEW.profile_pic) = '' THEN
    SET NEW.profile_pic = 'default.jpg';
  END IF;
END$$

-- Follows: prevent self-follow and ensure users exist
CREATE TRIGGER follows_bi BEFORE INSERT ON follows
FOR EACH ROW
BEGIN
  DECLARE v_cnt INT DEFAULT 0;

  IF NEW.follower_username = NEW.following_username THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot follow yourself';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM credentials WHERE username = NEW.follower_username;
  IF v_cnt = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Follower user does not exist';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM credentials WHERE username = NEW.following_username;
  IF v_cnt = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Target user does not exist';
  END IF;
END$$

-- Notifications: coerce seen to boolean and trim text
CREATE TRIGGER notifications_bi BEFORE INSERT ON notifications
FOR EACH ROW
BEGIN
  SET NEW.type = TRIM(IFNULL(NEW.type, ''));
  SET NEW.message = TRIM(IFNULL(NEW.message, ''));
  IF NEW.seen IS NULL OR NEW.seen NOT IN (0,1) THEN
    SET NEW.seen = 0;
  END IF;
END$$

CREATE TRIGGER notifications_bu BEFORE UPDATE ON notifications
FOR EACH ROW
BEGIN
  SET NEW.type = TRIM(IFNULL(NEW.type, ''));
  SET NEW.message = TRIM(IFNULL(NEW.message, ''));
  IF NEW.seen IS NULL OR NEW.seen NOT IN (0,1) THEN
    SET NEW.seen = 0;
  END IF;
END$$

-- Posts: validate image filename and sanitize caption
CREATE TRIGGER posts_bi BEFORE INSERT ON posts
FOR EACH ROW
BEGIN
  SET NEW.caption = NULLIF(LEFT(TRIM(IFNULL(NEW.caption, '')), 1000), '');

  IF NEW.image_filename IS NULL OR TRIM(NEW.image_filename) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Image filename required';
  END IF;

  -- enforce storage path and extension
  IF NEW.image_filename NOT REGEXP '^posts/' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Image must be stored under posts/ path';
  END IF;
  IF NEW.image_filename NOT REGEXP '\\.(jpg|jpeg|png|gif)$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unsupported image type';
  END IF;
END$$

-- Post Likes: prevent liking own post
CREATE TRIGGER post_likes_bi BEFORE INSERT ON post_likes
FOR EACH ROW
BEGIN
  DECLARE v_author VARCHAR(255);

  SELECT author_username INTO v_author FROM posts WHERE id = NEW.post_id LIMIT 1;
  IF v_author IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Post not found';
  END IF;

  IF v_author = NEW.username THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot like your own post';
  END IF;
END$$

-- Post Comments: sanitize and validate comment text
CREATE TRIGGER post_comments_bi BEFORE INSERT ON post_comments
FOR EACH ROW
BEGIN
  SET NEW.comment_text = TRIM(IFNULL(NEW.comment_text, ''));
  IF NEW.comment_text = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Comment cannot be empty';
  END IF;
  SET NEW.comment_text = LEFT(NEW.comment_text, 1000);
END$$

-- Direct Messages: sanitize, prevent self-message, normalize flags
CREATE TRIGGER direct_messages_bi BEFORE INSERT ON direct_messages
FOR EACH ROW
BEGIN
  SET NEW.message_text = TRIM(IFNULL(NEW.message_text, ''));
  IF NEW.message_text = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Message cannot be empty';
  END IF;

  IF NEW.sender_username = NEW.receiver_username THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot message yourself';
  END IF;

  IF NEW.is_read IS NULL OR NEW.is_read NOT IN (0,1) THEN
    SET NEW.is_read = 0;
  END IF;
END$$

CREATE TRIGGER direct_messages_bu BEFORE UPDATE ON direct_messages
FOR EACH ROW
BEGIN
  SET NEW.message_text = TRIM(IFNULL(NEW.message_text, ''));
  IF NEW.message_text = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Message cannot be empty';
  END IF;

  IF NEW.is_read IS NULL OR NEW.is_read NOT IN (0,1) THEN
    SET NEW.is_read = 0;
  END IF;

  IF NEW.is_read = 1 AND (OLD.is_read IS NULL OR OLD.is_read = 0) AND NEW.read_at IS NULL THEN
    SET NEW.read_at = CURRENT_TIMESTAMP;
  END IF;
END$$

DELIMITER ;

-- =====================
-- End of BeatBuzz schema
-- =====================