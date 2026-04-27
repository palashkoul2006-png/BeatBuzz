-- Data integrity triggers to prevent false/invalid inputs
-- Run this after base tables and posts feature are created

-- Profiles: sanitize text, validate year, ensure verified email, default profile pic
DROP TRIGGER IF EXISTS profiles_bi;
DROP TRIGGER IF EXISTS profiles_bu;
DELIMITER $$
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
DROP TRIGGER IF EXISTS follows_bi;
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
DROP TRIGGER IF EXISTS notifications_bi;
DROP TRIGGER IF EXISTS notifications_bu;
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
DROP TRIGGER IF EXISTS posts_bi;
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
DROP TRIGGER IF EXISTS post_likes_bi;
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
DROP TRIGGER IF EXISTS post_comments_bi;
CREATE TRIGGER post_comments_bi BEFORE INSERT ON post_comments
FOR EACH ROW
BEGIN
  SET NEW.comment_text = TRIM(IFNULL(NEW.comment_text, ''));
  IF NEW.comment_text = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Comment cannot be empty';
  END IF;
  SET NEW.comment_text = LEFT(NEW.comment_text, 1000);
END$$
DELIMITER ;