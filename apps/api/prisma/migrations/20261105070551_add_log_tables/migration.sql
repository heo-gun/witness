-- CreateTable
CREATE TABLE `log_entries` (
    `leaf_index` INTEGER NOT NULL,
    `type` ENUM('ISSUE', 'REVOKE', 'KEY_REGISTER', 'KEY_REVOKE') NOT NULL,
    `entry_bytes` BLOB NOT NULL,
    `leaf_hash` CHAR(64) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `actor_id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NULL,
    `key_fingerprint` CHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `log_entries_document_id_idx`(`document_id`),
    INDEX `log_entries_key_fingerprint_idx`(`key_fingerprint`),
    INDEX `log_entries_org_id_idx`(`org_id`),
    INDEX `log_entries_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`leaf_index`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tree_heads` (
    `tree_size` INTEGER NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `root_hash` CHAR(64) NOT NULL,
    `signature` CHAR(128) NOT NULL,

    PRIMARY KEY (`tree_size`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `revocations` (
    `id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NOT NULL,
    `leaf_index` INTEGER NOT NULL,
    `target_leaf_index` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `revoked_by_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `revocations_document_id_key`(`document_id`),
    UNIQUE INDEX `revocations_leaf_index_key`(`leaf_index`),
    UNIQUE INDEX `revocations_target_leaf_index_key`(`target_leaf_index`),
    INDEX `revocations_revoked_by_id_idx`(`revoked_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `log_state` (
    `id` INTEGER NOT NULL,
    `tree_size` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `log_entries` ADD CONSTRAINT `log_entries_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `log_entries` ADD CONSTRAINT `log_entries_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `log_entries` ADD CONSTRAINT `log_entries_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `log_entries` ADD CONSTRAINT `log_entries_key_fingerprint_fkey` FOREIGN KEY (`key_fingerprint`) REFERENCES `member_keys`(`fingerprint`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revocations` ADD CONSTRAINT `revocations_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revocations` ADD CONSTRAINT `revocations_leaf_index_fkey` FOREIGN KEY (`leaf_index`) REFERENCES `log_entries`(`leaf_index`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revocations` ADD CONSTRAINT `revocations_target_leaf_index_fkey` FOREIGN KEY (`target_leaf_index`) REFERENCES `log_entries`(`leaf_index`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revocations` ADD CONSTRAINT `revocations_revoked_by_id_fkey` FOREIGN KEY (`revoked_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- SeedLogState
INSERT INTO `log_state` (`id`, `tree_size`) VALUES (1, 0);
