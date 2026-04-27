-- Direct user-to-user chat feature tables and triggers

-- Conversations are implicit via pairs of usernames; this table stores messages
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
);

-- Helpful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dm_pair_time ON direct_messages(sender_username, receiver_username, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_receiver_unread ON direct_messages(receiver_username, is_read);
CREATE INDEX IF NOT EXISTS idx_dm_created_at ON direct_messages(created_at);

-- Triggers to sanitize and enforce basic constraints
DROP TRIGGER IF EXISTS direct_messages_bi;
DROP TRIGGER IF EXISTS direct_messages_bu;
DELIMITER $$
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

  -- normalize is_read
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

  -- stamp read_at when transitioning to read
  IF NEW.is_read = 1 AND (OLD.is_read IS NULL OR OLD.is_read = 0) AND NEW.read_at IS NULL THEN
    SET NEW.read_at = CURRENT_TIMESTAMP;
  END IF;
END$$
DELIMITER ;