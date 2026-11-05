-- CreateTable
CREATE TABLE `member_keys` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `purpose` ENUM('sign', 'encrypt') NOT NULL,
    `public_key` CHAR(64) NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `status` ENUM('pending', 'active', 'revoked') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `member_keys_fingerprint_key`(`fingerprint`),
    INDEX `member_keys_user_id_org_id_purpose_status_idx`(`user_id`, `org_id`, `purpose`, `status`),
    INDEX `member_keys_org_id_idx`(`org_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `signature_requests` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NOT NULL,
    `requester_id` CHAR(36) NOT NULL,
    `signer_id` CHAR(36) NOT NULL,
    `status` ENUM('awaiting_upload', 'pending', 'needs_resend', 'signed', 'rejected') NOT NULL DEFAULT 'awaiting_upload',
    `reject_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decided_at` DATETIME(3) NULL,

    UNIQUE INDEX `signature_requests_document_id_key`(`document_id`),
    INDEX `signature_requests_signer_id_status_idx`(`signer_id`, `status`),
    INDEX `signature_requests_org_id_idx`(`org_id`),
    INDEX `signature_requests_requester_id_idx`(`requester_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `encrypted_files` (
    `id` CHAR(36) NOT NULL,
    `request_id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `ephemeral_public_key` CHAR(64) NOT NULL,
    `iv` CHAR(24) NOT NULL,
    `recipient_fingerprint` CHAR(64) NOT NULL,
    `size` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `encrypted_files_request_id_key`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `issuer_id` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `category` ENUM('budget', 'settlement', 'receipt', 'agenda', 'other') NOT NULL,
    `file_hash` CHAR(64) NOT NULL,
    `status` ENUM('pending', 'valid', 'rejected', 'revoked') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `documents_file_hash_idx`(`file_hash`),
    INDEX `documents_issuer_id_idx`(`issuer_id`),
    UNIQUE INDEX `documents_org_id_file_hash_key`(`org_id`, `file_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `member_keys` ADD CONSTRAINT `member_keys_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_keys` ADD CONSTRAINT `member_keys_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `signature_requests` ADD CONSTRAINT `signature_requests_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `signature_requests` ADD CONSTRAINT `signature_requests_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `signature_requests` ADD CONSTRAINT `signature_requests_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `signature_requests` ADD CONSTRAINT `signature_requests_signer_id_fkey` FOREIGN KEY (`signer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `encrypted_files` ADD CONSTRAINT `encrypted_files_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `signature_requests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_issuer_id_fkey` FOREIGN KEY (`issuer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
