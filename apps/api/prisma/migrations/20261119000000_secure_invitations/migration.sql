ALTER TABLE `invitations`
  MODIFY `status` ENUM('pending', 'accepted', 'declined', 'cancelled') NOT NULL DEFAULT 'pending',
  ADD COLUMN `token_hash` CHAR(64) NULL,
  ADD COLUMN `expires_at` DATETIME(3) NULL;

-- Legacy invitations have no secret and must be reissued.
UPDATE `invitations` SET `status` = 'cancelled', `responded_at` = CURRENT_TIMESTAMP(3)
WHERE `status` = 'pending';
