-- Généré depuis API/Mainapi/db/schema (CREATE TABLE IF NOT EXISTS). Exécuté au premier démarrage de MySQL.
SET FOREIGN_KEY_CHECKS=0;
CREATE TABLE IF NOT EXISTS `access_keys` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `key_value` VARCHAR(255) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `used` TINYINT(1) NOT NULL DEFAULT 0,
  `duree_validite` VARCHAR(64) DEFAULT NULL,
  `expires_at` BIGINT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_access_keys_key_value` (`key_value`),
  KEY `idx_access_keys_active_used` (`active`, `used`),
  KEY `idx_access_keys_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` VARCHAR(255) NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` ENUM('oauth', 'bip39') NOT NULL,
  `device` TEXT,
  `user_agent` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `accessed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_sessions_user` (`user_id`, `user_type`),
  KEY `idx_user_sessions_accessed` (`accessed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `films` (
  `id` INT NOT NULL,
  `links` JSON DEFAULT NULL,
  `download_links` JSON DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `series` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `series_id` INT NOT NULL,
  `season_number` INT NOT NULL,
  `episode_number` INT NOT NULL,
  `links` JSON DEFAULT NULL,
  `download_links` JSON DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_series_episode` (`series_id`, `season_number`, `episode_number`),
  KEY `idx_series_lookup` (`series_id`, `season_number`, `episode_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `account_links` (
  `provider` ENUM('discord', 'google', 'bip39') NOT NULL,
  `provider_user_id` VARCHAR(255) NOT NULL,
  `target_user_type` ENUM('oauth', 'bip39') NOT NULL,
  `target_user_id` VARCHAR(255) NOT NULL,
  `linked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`provider`, `provider_user_id`),
  UNIQUE KEY `uniq_account_links_target_provider` (`target_user_type`, `target_user_id`, `provider`),
  KEY `idx_account_links_target` (`target_user_type`, `target_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clone_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` ENUM('uqload') NOT NULL,
  `media_type` ENUM('movie', 'tv') NOT NULL,
  `tmdb_id` INT NOT NULL,
  `season_number` INT NOT NULL DEFAULT 0,
  `episode_number` INT NOT NULL DEFAULT 0,
  `source_file_code` VARCHAR(64) NOT NULL,
  `clone_file_code` VARCHAR(64) DEFAULT NULL,
  `clone_embed_url` VARCHAR(2048) DEFAULT NULL,
  `status` ENUM('pending', 'ready', 'failed') NOT NULL DEFAULT 'pending',
  `last_error` TEXT,
  `last_checked_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_clone_scope` (`provider`, `media_type`, `tmdb_id`, `season_number`, `episode_number`, `source_file_code`),
  KEY `idx_clone_lookup` (`media_type`, `tmdb_id`, `season_number`, `episode_number`),
  KEY `idx_clone_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `download_links_history` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `admin_id` VARCHAR(255) NOT NULL,
  `admin_auth_type` ENUM('oauth','bip-39') NOT NULL,
  `action` ENUM('added','removed') NOT NULL,
  `media_type` ENUM('movie','tv') NOT NULL,
  `tmdb_id` BIGINT NOT NULL,
  `season` INT DEFAULT NULL,
  `episode` INT DEFAULT NULL,
  `link_url` TEXT NOT NULL,
  `link_type` ENUM('streaming','download') NOT NULL DEFAULT 'download',
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dlh_admin` (`admin_id`, `admin_auth_type`),
  KEY `idx_dlh_changed` (`changed_at`),
  KEY `idx_dlh_action` (`action`),
  KEY `idx_dlh_link_type` (`link_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `help_feedback` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(64) NOT NULL,
  `helpful` TINYINT(1) NOT NULL,
  `ip_hash` CHAR(64) NOT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_slug_ip` (`slug`, `ip_hash`),
  KEY `idx_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `auth_type` ENUM('oauth', 'bip-39') NOT NULL,
  `role` ENUM('admin','uploader') NOT NULL DEFAULT 'admin',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admins_user_id` (`user_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_auth_type` (`auth_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `banned_users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ban_type` ENUM('ip', 'user') NOT NULL,
  `ban_value` VARCHAR(255) NOT NULL,
  `user_type` VARCHAR(10) DEFAULT NULL,
  `reason` VARCHAR(500) DEFAULT NULL,
  `banned_by` VARCHAR(255) NOT NULL,
  `banned_at` BIGINT NOT NULL,
  `expires_at` BIGINT DEFAULT NULL,
  `username` VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_ban` (`ban_type`, `ban_value`, `user_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `content_type` VARCHAR(50) NOT NULL,
  `content_id` VARCHAR(255) NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` VARCHAR(50) NOT NULL,
  `profile_id` VARCHAR(255) DEFAULT NULL,
  `username` VARCHAR(255) NOT NULL,
  `avatar` TEXT,
  `content` TEXT NOT NULL,
  `is_spoiler` TINYINT(1) DEFAULT 0,
  `is_vip` TINYINT(1) DEFAULT 0,
  `is_admin` TINYINT(1) DEFAULT 0,
  `is_edited` TINYINT(1) DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT DEFAULT NULL,
  `deleted` TINYINT(1) DEFAULT 0,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `moderation_reason` VARCHAR(50) DEFAULT NULL,
  `moderation_details` TEXT,
  `moderated_at` BIGINT DEFAULT NULL,
  `approved_by_admin` TINYINT(1) DEFAULT 0,
  `approved_at` BIGINT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comments_content` (`content_type`, `content_id`),
  KEY `idx_comments_user` (`user_id`),
  KEY `idx_comments_moderation` (`deleted`, `moderation_reason`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comment_replies` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `comment_id` INT NOT NULL,
  `parent_reply_id` INT DEFAULT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` VARCHAR(50) NOT NULL,
  `profile_id` VARCHAR(255) DEFAULT NULL,
  `username` VARCHAR(255) NOT NULL,
  `avatar` TEXT,
  `reply_to_username` VARCHAR(255) DEFAULT NULL,
  `content` TEXT NOT NULL,
  `is_spoiler` TINYINT(1) DEFAULT 0,
  `is_vip` TINYINT(1) DEFAULT 0,
  `is_admin` TINYINT(1) DEFAULT 0,
  `is_edited` TINYINT(1) DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT DEFAULT NULL,
  `deleted` TINYINT(1) DEFAULT 0,
  `hierarchical_path` VARCHAR(255) DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `moderation_reason` VARCHAR(50) DEFAULT NULL,
  `moderation_details` TEXT,
  `moderated_at` BIGINT DEFAULT NULL,
  `approved_by_admin` TINYINT(1) DEFAULT 0,
  `approved_at` BIGINT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_replies_comment` (`comment_id`),
  KEY `idx_replies_user` (`user_id`),
  KEY `idx_replies_hierarchical_path` (`comment_id`, `hierarchical_path`),
  KEY `idx_replies_moderation` (`deleted`, `moderation_reason`),
  CONSTRAINT `fk_comment_replies_comment` FOREIGN KEY (`comment_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comment_replies_parent` FOREIGN KEY (`parent_reply_id`) REFERENCES `comment_replies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comment_reactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `target_type` VARCHAR(50) NOT NULL,
  `target_id` INT NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` VARCHAR(50) NOT NULL,
  `profile_id` VARCHAR(255) DEFAULT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_reaction` (`target_type`, `target_id`, `user_id`, `user_type`, `profile_id`),
  KEY `idx_reactions_target` (`target_type`, `target_id`),
  KEY `idx_reactions_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` VARCHAR(50) NOT NULL,
  `profile_id` VARCHAR(255) DEFAULT NULL,
  `from_user_id` VARCHAR(255) NOT NULL,
  `from_profile_id` VARCHAR(255) DEFAULT NULL,
  `from_username` VARCHAR(255) NOT NULL,
  `from_avatar` TEXT,
  `notification_type` VARCHAR(50) NOT NULL,
  `target_type` VARCHAR(50) NOT NULL,
  `target_id` INT NOT NULL,
  `content_type` VARCHAR(50) NOT NULL,
  `content_id` VARCHAR(255) NOT NULL,
  `comment_preview` TEXT,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user` (`user_id`, `is_read`),
  KEY `idx_notifications_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `likes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `content_type` VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `content_id` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_type` VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `profile_id` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `vote_type` VARCHAR(20) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_like` (`content_type`, `content_id`, `user_id`, `user_type`, `profile_id`),
  KEY `idx_likes_content` (`content_type`, `content_id`),
  KEY `idx_likes_user` (`user_id`, `user_type`, `profile_id`),
  KEY `idx_likes_content_vote` (`content_type`, `content_id`, `vote_type`),
  KEY `idx_likes_stats` (`content_type`, `content_id`, `vote_type`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reports` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `reporter_user_id` VARCHAR(255) NOT NULL,
  `reporter_user_type` ENUM('oauth', 'bip39') NOT NULL,
  `reporter_profile_id` VARCHAR(255) NOT NULL,
  `target_type` ENUM('comment', 'reply', 'shared_list', 'segment') NOT NULL,
  `target_id` VARCHAR(255) NOT NULL,
  `reason` ENUM('spam', 'harassment', 'sexual_content', 'unmarked_spoiler', 'impersonation', 'other', 'wrong_timestamp') NOT NULL,
  `details` TEXT,
  `status` ENUM('pending', 'resolved', 'dismissed') DEFAULT 'pending',
  `resolved_by` VARCHAR(255) DEFAULT NULL,
  `resolved_at` BIGINT DEFAULT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reports_status` (`status`),
  KEY `idx_reports_target` (`target_type`, `target_id`),
  KEY `idx_reports_reporter` (`reporter_user_id`, `reporter_profile_id`),
  UNIQUE KEY `uq_report_per_user` (`reporter_user_id`, `reporter_profile_id`, `target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_notification_preferences` (
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` VARCHAR(50) NOT NULL,
  `notifications_disabled` TINYINT(1) DEFAULT 0,
  `updated_at` BIGINT DEFAULT NULL,
  PRIMARY KEY (`user_id`, `user_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` VARCHAR(50) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `p256dh` TEXT NOT NULL,
  `auth` TEXT NOT NULL,
  `created_at` BIGINT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_push` (`user_id`, `user_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shared_lists` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_type` VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `profile_id` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `list_id` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `share_code` VARCHAR(20) NOT NULL,
  `is_public_in_catalog` TINYINT(1) NOT NULL DEFAULT 0,
  `moderation_flagged` TINYINT(1) NOT NULL DEFAULT 0,
  `moderation_reason` VARCHAR(255) DEFAULT NULL,
  `moderation_details` TEXT,
  `moderated_at` BIGINT DEFAULT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_share_code` (`share_code`),
  UNIQUE KEY `uq_user_list` (`user_id`, `user_type`, `profile_id`, `list_id`),
  KEY `idx_shared_lists_share_code` (`share_code`),
  KEY `idx_shared_lists_user_profile` (`user_id`, `user_type`, `profile_id`),
  KEY `idx_shared_lists_moderation` (`moderation_flagged`, `is_public_in_catalog`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `link_submissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `profile_id` VARCHAR(255) NOT NULL,
  `tmdb_id` INT NOT NULL,
  `media_type` ENUM('movie', 'tv') NOT NULL,
  `season_number` INT DEFAULT NULL,
  `episode_number` INT DEFAULT NULL,
  `url` VARCHAR(2048) NOT NULL,
  `source_name` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  `rejection_reason` TEXT,
  `reviewed_by` VARCHAR(255) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ls_status` (`status`),
  KEY `idx_ls_profile` (`profile_id`),
  KEY `idx_ls_tmdb` (`tmdb_id`, `media_type`),
  KEY `idx_ls_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wishboard_requests` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `profile_id` VARCHAR(255) NOT NULL,
  `tmdb_id` INT NOT NULL,
  `media_type` ENUM('movie','tv') NOT NULL,
  `season_number` INT DEFAULT NULL,
  `status` ENUM('pending','not_found','not_found_recent','searching','added','rejected') DEFAULT 'pending',
  `vote_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wishboard_status_votes` (`status`, `vote_count`),
  KEY `idx_wishboard_media_tmdb_season` (`media_type`, `tmdb_id`, `season_number`),
  KEY `idx_wishboard_profile_created` (`profile_id`, `created_at`),
  KEY `idx_wishboard_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wishboard_votes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `profile_id` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wishboard_vote` (`request_id`, `user_id`),
  KEY `idx_wishboard_votes_profile_created` (`profile_id`, `created_at`),
  KEY `idx_wishboard_votes_request` (`request_id`),
  CONSTRAINT `fk_wishboard_votes_request` FOREIGN KEY (`request_id`) REFERENCES `wishboard_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wishboard_notes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `admin_id` VARCHAR(255) DEFAULT NULL,
  `note` TEXT NOT NULL,
  `is_public` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wishboard_note_request` (`request_id`),
  CONSTRAINT `fk_wishboard_notes_request` FOREIGN KEY (`request_id`) REFERENCES `wishboard_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wishboard_status_history` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `status` ENUM('pending','not_found','not_found_recent','searching','added','rejected') NOT NULL,
  `reason` TEXT,
  `admin_id` VARCHAR(255) DEFAULT NULL,
  `admin_auth_type` VARCHAR(10) DEFAULT NULL,
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wsh_request_changed` (`request_id`, `changed_at`),
  KEY `idx_wsh_admin_status` (`admin_id`, `status`),
  CONSTRAINT `fk_wishboard_status_history_request` FOREIGN KEY (`request_id`) REFERENCES `wishboard_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `oauth_clients` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` VARCHAR(128) NOT NULL,
  `client_name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `homepage_url` VARCHAR(500) DEFAULT NULL,
  `redirect_uris` JSON NOT NULL,
  `allowed_scopes` JSON NOT NULL,
  `public_client` TINYINT(1) NOT NULL DEFAULT 1,
  `require_pkce` TINYINT(1) NOT NULL DEFAULT 1,
  `client_secret` VARCHAR(256) DEFAULT NULL,
  `icon_filename` VARCHAR(200) DEFAULT NULL,
  `vip_days_balance` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` BIGINT UNSIGNED NOT NULL,
  `updated_at` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_clients_client_id` (`client_id`),
  KEY `idx_client_id` (`client_id`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `oauth_app_stats` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` VARCHAR(128) NOT NULL,
  `event_type` VARCHAR(32) NOT NULL,
  `user_id` VARCHAR(160) DEFAULT NULL,
  `metadata` JSON DEFAULT NULL,
  `created_at` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_client_event` (`client_id`, `event_type`, `created_at`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `oauth_vip_grants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(160) NOT NULL,
  `user_type` VARCHAR(16) NOT NULL,
  `user_id_only` VARCHAR(128) NOT NULL,
  `days_granted` INT UNSIGNED NOT NULL,
  `access_key_value` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `granted_at` BIGINT UNSIGNED NOT NULL,
  `revoked_at` BIGINT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_client_id` (`client_id`, `granted_at`),
  KEY `idx_user_id` (`user_id`, `granted_at`),
  KEY `idx_access_key` (`access_key_value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `oauth_authorization_codes` (
  `code_hash` CHAR(64) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` ENUM('oauth', 'bip39') NOT NULL,
  `session_id` VARCHAR(255) DEFAULT NULL,
  `scopes` TEXT NOT NULL,
  `redirect_uri` TEXT NOT NULL,
  `code_challenge` VARCHAR(255) DEFAULT NULL,
  `code_challenge_method` VARCHAR(20) DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code_hash`),
  KEY `idx_oauth_codes_client` (`client_id`),
  KEY `idx_oauth_codes_user` (`user_id`, `user_type`),
  KEY `idx_oauth_codes_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `oauth_authorization_requests` (
  `request_hash` CHAR(64) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `redirect_uri` TEXT NOT NULL,
  `response_type` VARCHAR(20) NOT NULL DEFAULT 'code',
  `scopes` TEXT NOT NULL,
  `state` TEXT,
  `code_challenge` VARCHAR(255) DEFAULT NULL,
  `code_challenge_method` VARCHAR(20) DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `consumed_at` DATETIME DEFAULT NULL,
  `decision` ENUM('approved', 'rejected') DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_hash`),
  KEY `idx_oauth_requests_client` (`client_id`),
  KEY `idx_oauth_requests_expiry` (`expires_at`),
  KEY `idx_oauth_requests_consumed` (`consumed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `oauth_access_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `user_type` ENUM('oauth', 'bip39') NOT NULL,
  `session_id` VARCHAR(255) DEFAULT NULL,
  `scopes` TEXT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME DEFAULT NULL,
  `authorization_code_hash` CHAR(64) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_hash`),
  KEY `idx_oauth_tokens_client` (`client_id`),
  KEY `idx_oauth_tokens_user` (`user_id`, `user_type`),
  KEY `idx_oauth_tokens_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vip_derivation_counters` (
  `coin` ENUM('btc', 'ltc') NOT NULL,
  `next_index` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`coin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vip_invoices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `public_id` VARCHAR(64) NOT NULL,
  `payment_method` ENUM('btc', 'ltc', 'cryptogate', 'paygate_hosted', 'autobuy', 'payblis') NOT NULL,
  `status` ENUM('awaiting_payment', 'partial_payment', 'confirming', 'paid', 'delivered', 'expired', 'cancelled') NOT NULL DEFAULT 'awaiting_payment',
  `coin` ENUM('btc', 'ltc') DEFAULT NULL,
  `pack_eur` DECIMAL(10,2) NOT NULL,
  `amount_eur` DECIMAL(10,2) NOT NULL,
  `amount_usd` DECIMAL(10,2) NOT NULL,
  `amount_crypto_expected` DECIMAL(20,8) DEFAULT NULL,
  `amount_crypto_received` DECIMAL(20,8) NOT NULL DEFAULT 0,
  `vip_years` DECIMAL(5,2) NOT NULL,
  `recipient_mode` ENUM('self', 'gift') NOT NULL,
  `payment_address` VARCHAR(128) DEFAULT NULL,
  `address_type` VARCHAR(32) DEFAULT NULL,
  `derivation_index` INT DEFAULT NULL,
  `confirmations` INT NOT NULL DEFAULT 0,
  `required_confirmations` INT NOT NULL DEFAULT 1,
  `tx_hash` VARCHAR(128) DEFAULT NULL,
  `qr_payload` TEXT,
  `gift_token` VARCHAR(64) DEFAULT NULL,
  `gift_sealed` TINYINT(1) NOT NULL DEFAULT 1,
  `gift_unsealed_at` DATETIME DEFAULT NULL,
  `gift_unseal_count` INT NOT NULL DEFAULT 0,
  `gift_unsealed_by_ip_hash` VARCHAR(128) DEFAULT NULL,
  `vip_key_value` VARCHAR(255) DEFAULT NULL,
  `created_by_user_id` VARCHAR(255) DEFAULT NULL,
  `created_by_user_type` VARCHAR(32) DEFAULT NULL,
  `created_by_session_id` VARCHAR(255) DEFAULT NULL,
  `created_ip_hash` VARCHAR(128) DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `paid_at` DATETIME DEFAULT NULL,
  `delivered_at` DATETIME DEFAULT NULL,
  `next_check_at` DATETIME DEFAULT NULL,
  `paygate_callback_reference` VARCHAR(64) DEFAULT NULL,
  `paygate_tracking_address` VARCHAR(255) DEFAULT NULL,
  `paygate_temporary_wallet_address` VARCHAR(255) DEFAULT NULL,
  `paygate_callback_url` TEXT,
  `paygate_callback_nonce` VARCHAR(128) DEFAULT NULL,
  `paygate_checkout_url` TEXT,
  `paygate_payer_email` VARCHAR(255) DEFAULT NULL,
  `paygate_ipn_token` VARCHAR(512) DEFAULT NULL,
  `paygate_paid_coin` VARCHAR(64) DEFAULT NULL,
  `paygate_paid_value` DECIMAL(18,8) DEFAULT NULL,
  `paygate_paid_txid_in` VARCHAR(255) DEFAULT NULL,
  `paygate_paid_txid` VARCHAR(255) DEFAULT NULL,
  `autobuy_order_id` VARCHAR(128) DEFAULT NULL,
  `autobuy_product_id` VARCHAR(128) DEFAULT NULL,
  `autobuy_email` VARCHAR(255) DEFAULT NULL,
  `autobuy_checkout_url` TEXT,
  `autobuy_gateway` VARCHAR(64) DEFAULT NULL,
  `autobuy_currency` VARCHAR(16) DEFAULT NULL,
  `autobuy_total` DECIMAL(18,8) DEFAULT NULL,
  `autobuy_order_created_at` DATETIME DEFAULT NULL,
  `cryptogate_payment_id` VARCHAR(128) DEFAULT NULL,
  `cryptogate_checkout_url` TEXT,
  `cryptogate_payer_email` VARCHAR(255) DEFAULT NULL,
  `cryptogate_provider` VARCHAR(64) DEFAULT NULL,
  `cryptogate_paid_amount` DECIMAL(18,2) DEFAULT NULL,
  `cryptogate_paid_currency` VARCHAR(16) DEFAULT NULL,
  `cryptogate_last_webhook_id` VARCHAR(128) DEFAULT NULL,
  `cryptogate_last_event` VARCHAR(64) DEFAULT NULL,
  `cryptogate_webhook_received_at` DATETIME DEFAULT NULL,
  `payblis_ref_order` VARCHAR(128) DEFAULT NULL,
  `payblis_checkout_url` TEXT,
  `payblis_payer_email` VARCHAR(255) DEFAULT NULL,
  `payblis_customer_name` VARCHAR(255) DEFAULT NULL,
  `payblis_method` VARCHAR(64) DEFAULT NULL,
  `payblis_transaction_id` VARCHAR(255) DEFAULT NULL,
  `payblis_paid_amount` DECIMAL(18,2) DEFAULT NULL,
  `payblis_paid_currency` VARCHAR(16) DEFAULT NULL,
  `payblis_ipn_received_at` DATETIME DEFAULT NULL,
  `payblis_ipn_raw_payload` LONGTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vip_invoices_public_id` (`public_id`),
  UNIQUE KEY `uq_vip_invoices_gift_token` (`gift_token`),
  KEY `idx_vip_invoices_payment_method` (`payment_method`),
  KEY `idx_vip_invoices_status` (`status`),
  KEY `idx_vip_invoices_coin` (`coin`),
  KEY `idx_vip_invoices_created_at` (`created_at`),
  KEY `idx_vip_invoices_payment_address` (`payment_address`),
  KEY `idx_vip_invoices_vip_key` (`vip_key_value`),
  KEY `idx_vip_invoices_paygate_paid_txid` (`paygate_paid_txid`),
  UNIQUE KEY `uniq_vip_invoices_paygate_callback_reference` (`paygate_callback_reference`),
  UNIQUE KEY `uniq_vip_invoices_paygate_paid_txid_in` (`paygate_paid_txid_in`),
  UNIQUE KEY `uniq_vip_invoices_autobuy_order_id` (`autobuy_order_id`),
  UNIQUE KEY `uniq_vip_invoices_cryptogate_payment_id` (`cryptogate_payment_id`),
  UNIQUE KEY `uniq_vip_invoices_payblis_ref_order` (`payblis_ref_order`),
  KEY `idx_vip_invoices_payblis_tx` (`payblis_transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vip_invoice_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `invoice_id` INT NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `actor_type` VARCHAR(32) DEFAULT NULL,
  `actor_id` VARCHAR(255) DEFAULT NULL,
  `message` VARCHAR(255) DEFAULT NULL,
  `payload_json` LONGTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vip_invoice_events_invoice` (`invoice_id`),
  KEY `idx_vip_invoice_events_type` (`event_type`),
  CONSTRAINT `fk_vip_invoice_events_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `vip_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vip_donation_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `settings_json` LONGTEXT NOT NULL,
  `updated_by` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wrapped_viewing_data` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `profile_id` VARCHAR(255) DEFAULT NULL,
  `content_type` ENUM('movie', 'tv', 'anime', 'live-tv') NOT NULL,
  `content_id` VARCHAR(255) NOT NULL,
  `content_title` VARCHAR(255) DEFAULT NULL,
  `season_number` INT DEFAULT NULL,
  `episode_number` INT DEFAULT NULL,
  `watch_duration` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `hour_of_day` TINYINT DEFAULT NULL,
  `month` INT NOT NULL,
  `year` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_year` (`user_id`, `year`),
  KEY `idx_content` (`content_type`, `content_id`),
  KEY `idx_hour` (`user_id`, `year`, `hour_of_day`),
  KEY `idx_viewing_lookup` (`user_id`, `profile_id`, `content_type`, `content_id`, `month`, `year`, `hour_of_day`),
  KEY `idx_generate_cover` (`user_id`, `year`, `profile_id`, `content_type`, `content_id`, `watch_duration`),
  KEY `idx_user_year_created` (`user_id`, `year`, `created_at`),
  KEY `idx_percentile_cover` (`year`, `user_id`, `watch_duration`),
  KEY `idx_top10` (`content_type`, `watch_duration`, `content_id`, `user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wrapped_pages_data` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `profile_id` VARCHAR(255) DEFAULT NULL,
  `page_name` VARCHAR(100) NOT NULL,
  `duration` INT DEFAULT 0,
  `meta_data` JSON DEFAULT NULL,
  `month` INT NOT NULL,
  `year` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_page_stats` (`user_id`, `page_name`, `year`),
  KEY `idx_page_lookup` (`user_id`, `profile_id`, `page_name`, `month`, `year`),
  KEY `idx_page_generate` (`user_id`, `year`, `profile_id`, `page_name`, `duration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tmdb_media` (
  `media_type` ENUM('movie','tv') NOT NULL,
  `tmdb_id` INT NOT NULL,
  `language` VARCHAR(8) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `original_title` VARCHAR(255) DEFAULT NULL,
  `overview` TEXT,
  `poster_path` VARCHAR(128) DEFAULT NULL,
  `backdrop_path` VARCHAR(128) DEFAULT NULL,
  `release_year` SMALLINT DEFAULT NULL,
  `vote_average` DECIMAL(3,1) DEFAULT NULL,
  `runtime_minutes` SMALLINT DEFAULT NULL,
  `status` VARCHAR(32) DEFAULT NULL,
  `seasons_json` JSON DEFAULT NULL,
  `fetched_at` DATETIME NOT NULL,
  PRIMARY KEY (`media_type`, `tmdb_id`, `language`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tmdb_episodes` (
  `tmdb_id` INT NOT NULL,
  `season` SMALLINT NOT NULL,
  `episode` SMALLINT NOT NULL,
  `language` VARCHAR(8) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `overview` TEXT,
  `still_path` VARCHAR(128) DEFAULT NULL,
  `runtime_minutes` SMALLINT DEFAULT NULL,
  `fetched_at` DATETIME NOT NULL,
  PRIMARY KEY (`tmdb_id`, `season`, `episode`, `language`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `watch_progress` (
  `user_type` VARCHAR(16) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `profile_id` VARCHAR(64) NOT NULL,
  `media_type` ENUM('movie','tv') NOT NULL,
  `tmdb_id` INT NOT NULL,
  `season` SMALLINT NOT NULL DEFAULT 0,
  `episode` SMALLINT NOT NULL DEFAULT 0,
  `position_sec` INT NOT NULL,
  `duration_sec` INT NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`user_type`, `user_id`, `profile_id`, `media_type`, `tmdb_id`, `season`, `episode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `watch_history` (
  `user_type` VARCHAR(16) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `profile_id` VARCHAR(64) NOT NULL,
  `media_type` ENUM('movie','tv') NOT NULL,
  `tmdb_id` INT NOT NULL,
  `season` SMALLINT DEFAULT NULL,
  `episode` SMALLINT DEFAULT NULL,
  `finished` TINYINT(1) NOT NULL DEFAULT 0,
  `hidden` TINYINT(1) NOT NULL DEFAULT 0,
  `last_watched_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`user_type`, `user_id`, `profile_id`, `media_type`, `tmdb_id`),
  KEY `idx_history_recent` (`user_type`, `user_id`, `profile_id`, `last_watched_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `watch_history_imports` (
  `user_type` VARCHAR(16) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `profile_id` VARCHAR(64) NOT NULL,
  `imported_at` DATETIME NOT NULL,
  PRIMARY KEY (`user_type`, `user_id`, `profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `watch_marks` (
  `user_type` VARCHAR(16) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `profile_id` VARCHAR(64) NOT NULL,
  `media_type` ENUM('movie','tv') NOT NULL,
  `tmdb_id` INT NOT NULL,
  `season` SMALLINT NOT NULL DEFAULT 0,
  `episode` SMALLINT NOT NULL DEFAULT 0,
  `marked_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`user_type`, `user_id`, `profile_id`, `media_type`, `tmdb_id`, `season`, `episode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
