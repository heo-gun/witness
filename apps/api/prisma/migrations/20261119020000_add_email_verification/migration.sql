ALTER TABLE `users` ADD COLUMN `email_verified_at` DATETIME(3) NULL;

CREATE TABLE `email_tokens` (
    `user_id` CHAR(36) NOT NULL,
    `purpose` ENUM('verify_email', 'reset_password') NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `email_tokens_token_hash_key`(`token_hash`),
    INDEX `email_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`user_id`, `purpose`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `email_tokens` ADD CONSTRAINT `email_tokens_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
