import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sessions\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`created_at\` text,
    \`expires_at\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`users\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`role\` text DEFAULT 'child' NOT NULL,
    \`family_id\` text NOT NULL,
    \`allow_public_publishing\` integer DEFAULT false,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`email\` text NOT NULL,
    \`reset_password_token\` text,
    \`reset_password_expiration\` text,
    \`salt\` text,
    \`hash\` text,
    \`login_attempts\` numeric DEFAULT 0,
    \`lock_until\` text
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_family_id_idx\` ON \`users\` (\`family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`,
  );
  await db.run(sql`CREATE TABLE \`entries_tags\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`entries_tags_order_idx\` ON \`entries_tags\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_tags_parent_id_idx\` ON \`entries_tags\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`entries\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`type\` text DEFAULT 'quick' NOT NULL,
    \`title\` text,
    \`content\` text DEFAULT '',
    \`reflection\` text,
    \`learning\` text,
    \`parent_note\` text,
    \`original_text\` text,
    \`occurred_at\` text,
    \`date_precision\` text DEFAULT 'day' NOT NULL,
    \`date_note\` text,
    \`retrospective\` integer DEFAULT false,
    \`status\` text DEFAULT 'draft' NOT NULL,
    \`visibility\` text DEFAULT 'family' NOT NULL,
    \`public_requested\` integer DEFAULT false,
    \`review_status\` text DEFAULT 'none',
    \`family_id\` text NOT NULL,
    \`author_id\` integer NOT NULL,
    \`client_id\` text NOT NULL,
    \`revision\` numeric DEFAULT 1,
    \`public_snapshot\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`entries_occurred_at_idx\` ON \`entries\` (\`occurred_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_family_id_idx\` ON \`entries\` (\`family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_author_idx\` ON \`entries\` (\`author_id\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`entries_client_id_idx\` ON \`entries\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_updated_at_idx\` ON \`entries\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_created_at_idx\` ON \`entries\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`entries_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`media_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`entries_rels_order_idx\` ON \`entries_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_rels_parent_idx\` ON \`entries_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_rels_path_idx\` ON \`entries_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_rels_media_id_idx\` ON \`entries_rels\` (\`media_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`_entries_v_version_tags\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`label\` text NOT NULL,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_entries_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_tags_order_idx\` ON \`_entries_v_version_tags\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_tags_parent_id_idx\` ON \`_entries_v_version_tags\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`_entries_v\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`parent_id\` integer,
    \`version_type\` text DEFAULT 'quick' NOT NULL,
    \`version_title\` text,
    \`version_content\` text DEFAULT '',
    \`version_reflection\` text,
    \`version_learning\` text,
    \`version_parent_note\` text,
    \`version_original_text\` text,
    \`version_occurred_at\` text,
    \`version_date_precision\` text DEFAULT 'day' NOT NULL,
    \`version_date_note\` text,
    \`version_retrospective\` integer DEFAULT false,
    \`version_status\` text DEFAULT 'draft' NOT NULL,
    \`version_visibility\` text DEFAULT 'family' NOT NULL,
    \`version_public_requested\` integer DEFAULT false,
    \`version_review_status\` text DEFAULT 'none',
    \`version_family_id\` text NOT NULL,
    \`version_author_id\` integer NOT NULL,
    \`version_client_id\` text NOT NULL,
    \`version_revision\` numeric DEFAULT 1,
    \`version_public_snapshot\` text,
    \`version_updated_at\` text,
    \`version_created_at\` text,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`version_author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`_entries_v_parent_idx\` ON \`_entries_v\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_occurred_at_idx\` ON \`_entries_v\` (\`version_occurred_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_family_id_idx\` ON \`_entries_v\` (\`version_family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_author_idx\` ON \`_entries_v\` (\`version_author_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_client_id_idx\` ON \`_entries_v\` (\`version_client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_updated_at_idx\` ON \`_entries_v\` (\`version_updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_created_at_idx\` ON \`_entries_v\` (\`version_created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_created_at_idx\` ON \`_entries_v\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_updated_at_idx\` ON \`_entries_v\` (\`updated_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`_entries_v_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`media_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`_entries_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`_entries_v_rels_order_idx\` ON \`_entries_v_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_rels_parent_idx\` ON \`_entries_v_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_rels_path_idx\` ON \`_entries_v_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_rels_media_id_idx\` ON \`_entries_v_rels\` (\`media_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`media\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`alt\` text,
    \`image_kind\` text DEFAULT 'photo',
    \`family_id\` text NOT NULL,
    \`owner_id\` integer,
    \`original_size\` numeric,
    \`processing_status\` text DEFAULT 'ready',
    \`processing_error\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`url\` text,
    \`thumbnail_u_r_l\` text,
    \`filename\` text,
    \`mime_type\` text,
    \`filesize\` numeric,
    \`width\` numeric,
    \`height\` numeric,
    \`focal_x\` numeric,
    \`focal_y\` numeric,
    FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`media_family_id_idx\` ON \`media\` (\`family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`media_owner_idx\` ON \`media\` (\`owner_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`media_processing_status_idx\` ON \`media\` (\`processing_status\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_kv\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`key\` text NOT NULL,
    \`data\` text NOT NULL
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`global_slug\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`users_id\` integer,
    \`entries_id\` integer,
    \`media_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`entries_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_entries_id_idx\` ON \`payload_locked_documents_rels\` (\`entries_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`key\` text,
    \`value\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`users_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text,
    \`batch\` numeric,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`,
  );
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_sessions\`;`);
  await db.run(sql`DROP TABLE \`users\`;`);
  await db.run(sql`DROP TABLE \`entries_tags\`;`);
  await db.run(sql`DROP TABLE \`entries\`;`);
  await db.run(sql`DROP TABLE \`entries_rels\`;`);
  await db.run(sql`DROP TABLE \`_entries_v_version_tags\`;`);
  await db.run(sql`DROP TABLE \`_entries_v\`;`);
  await db.run(sql`DROP TABLE \`_entries_v_rels\`;`);
  await db.run(sql`DROP TABLE \`media\`;`);
  await db.run(sql`DROP TABLE \`payload_kv\`;`);
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`);
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_preferences\`;`);
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_migrations\`;`);
}
