-- BeatBuzz schema updates: ensure username linkage and indexes

-- Add username column to profiles if missing
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username VARCHAR(255);

-- Backfill profiles.username from credentials via email
UPDATE profiles p
JOIN credentials c ON p.email = c.email
SET p.username = c.username
WHERE p.username IS NULL OR p.username = '';

-- Make profiles.username unique if possible (may fail if duplicates exist)
ALTER TABLE profiles
  ADD UNIQUE KEY IF NOT EXISTS uniq_profiles_username (username);

-- Ensure notifications.seen has a default of 0
ALTER TABLE notifications
  MODIFY COLUMN seen TINYINT(1) NOT NULL DEFAULT 0;

-- Add helpful indexes to follows
ALTER TABLE follows
  ADD INDEX IF NOT EXISTS idx_follower (follower_username),
  ADD INDEX IF NOT EXISTS idx_following (following_username);

-- Prevent duplicate follow rows (may fail if duplicates exist)
ALTER TABLE follows
  ADD UNIQUE KEY IF NOT EXISTS uniq_follow_pair (follower_username, following_username);

-- End of migration