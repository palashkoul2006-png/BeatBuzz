-- Cloud storage integration: add URL columns and relax triggers

-- Add URL columns for profiles and posts
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_pic_url VARCHAR(512) DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url VARCHAR(512) DEFAULT NULL;

-- Replace posts_bi trigger to allow either local image_filename (uploads) or external image_url (Drive)
DROP TRIGGER IF EXISTS posts_bi;
DELIMITER $$
CREATE TRIGGER posts_bi BEFORE INSERT ON posts
FOR EACH ROW
BEGIN
  -- Sanitize caption
  SET NEW.caption = NULLIF(LEFT(TRIM(IFNULL(NEW.caption, '')), 1000), '');

  -- Require at least one of image fields
  IF (NEW.image_filename IS NULL OR TRIM(NEW.image_filename) = '') AND (NEW.image_url IS NULL OR TRIM(NEW.image_url) = '') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Either image_filename or image_url is required';
  END IF;

  -- If using local storage (image_filename), enforce existing constraints
  IF NEW.image_filename IS NOT NULL AND TRIM(NEW.image_filename) <> '' THEN
    IF NEW.image_filename NOT REGEXP '^posts/' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Image must be stored under posts/ path';
    END IF;
    IF NEW.image_filename NOT REGEXP '\\.(jpg|jpeg|png|gif)$' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unsupported image type';
    END IF;
  END IF;
END$$
DELIMITER ;