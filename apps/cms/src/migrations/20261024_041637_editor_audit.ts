import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`entries\` ADD \`edited_by_id\` integer REFERENCES users(id);`,
  );
  await db.run(sql`ALTER TABLE \`entries\` ADD \`editor_name\` text;`);
  await db.run(
    sql`CREATE INDEX \`entries_edited_by_idx\` ON \`entries\` (\`edited_by_id\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`_entries_v\` ADD \`version_edited_by_id\` integer REFERENCES users(id);`,
  );
  await db.run(
    sql`ALTER TABLE \`_entries_v\` ADD \`version_editor_name\` text;`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_edited_by_idx\` ON \`_entries_v\` (\`version_edited_by_id\`);`,
  );
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_entries\` (
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
    sql`INSERT INTO \`__new_entries\`("id", "type", "title", "content", "reflection", "learning", "parent_note", "original_text", "occurred_at", "date_precision", "date_note", "retrospective", "status", "visibility", "public_requested", "review_status", "family_id", "author_id", "client_id", "revision", "public_snapshot", "updated_at", "created_at") SELECT "id", "type", "title", "content", "reflection", "learning", "parent_note", "original_text", "occurred_at", "date_precision", "date_note", "retrospective", "status", "visibility", "public_requested", "review_status", "family_id", "author_id", "client_id", "revision", "public_snapshot", "updated_at", "created_at" FROM \`entries\`;`,
  );
  await db.run(sql`DROP TABLE \`entries\`;`);
  await db.run(sql`ALTER TABLE \`__new_entries\` RENAME TO \`entries\`;`);
  await db.run(sql`PRAGMA foreign_keys=ON;`);
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
  await db.run(sql`CREATE TABLE \`__new__entries_v\` (
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
    sql`INSERT INTO \`__new__entries_v\`("id", "parent_id", "version_type", "version_title", "version_content", "version_reflection", "version_learning", "version_parent_note", "version_original_text", "version_occurred_at", "version_date_precision", "version_date_note", "version_retrospective", "version_status", "version_visibility", "version_public_requested", "version_review_status", "version_family_id", "version_author_id", "version_client_id", "version_revision", "version_public_snapshot", "version_updated_at", "version_created_at", "created_at", "updated_at") SELECT "id", "parent_id", "version_type", "version_title", "version_content", "version_reflection", "version_learning", "version_parent_note", "version_original_text", "version_occurred_at", "version_date_precision", "version_date_note", "version_retrospective", "version_status", "version_visibility", "version_public_requested", "version_review_status", "version_family_id", "version_author_id", "version_client_id", "version_revision", "version_public_snapshot", "version_updated_at", "version_created_at", "created_at", "updated_at" FROM \`_entries_v\`;`,
  );
  await db.run(sql`DROP TABLE \`_entries_v\`;`);
  await db.run(sql`ALTER TABLE \`__new__entries_v\` RENAME TO \`_entries_v\`;`);
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
}
