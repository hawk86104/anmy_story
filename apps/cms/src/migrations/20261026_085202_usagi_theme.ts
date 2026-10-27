import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`spaces_interests\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`spaces\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`spaces_interests_order_idx\` ON \`spaces_interests\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`spaces_interests_parent_id_idx\` ON \`spaces_interests\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`spaces\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`family_id\` text NOT NULL,
  	\`owner_id\` integer NOT NULL,
  	\`display_name\` text DEFAULT '我的成长手记' NOT NULL,
  	\`bio\` text DEFAULT '关于探索、创造，和每一个小小的进步。',
  	\`avatar_id\` integer,
  	\`cover_id\` integer,
  	\`theme\` text DEFAULT 'usagi' NOT NULL,
  	\`modules_timeline\` integer DEFAULT true,
  	\`modules_works\` integer DEFAULT true,
  	\`modules_honors\` integer DEFAULT true,
  	\`modules_projects\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`avatar_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`spaces_family_id_idx\` ON \`spaces\` (\`family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`spaces_owner_idx\` ON \`spaces\` (\`owner_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`spaces_avatar_idx\` ON \`spaces\` (\`avatar_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`spaces_cover_idx\` ON \`spaces\` (\`cover_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`spaces_updated_at_idx\` ON \`spaces\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`spaces_created_at_idx\` ON \`spaces\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`projects\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text NOT NULL,
  	\`summary\` text,
  	\`description\` text,
  	\`started_at\` text,
  	\`status\` text DEFAULT 'exploring' NOT NULL,
  	\`visibility\` text DEFAULT 'family' NOT NULL,
  	\`cover_id\` integer,
  	\`family_id\` text NOT NULL,
  	\`owner_id\` integer NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`projects_cover_idx\` ON \`projects\` (\`cover_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`projects_family_id_idx\` ON \`projects\` (\`family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`projects_owner_idx\` ON \`projects\` (\`owner_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`projects_updated_at_idx\` ON \`projects\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`projects_created_at_idx\` ON \`projects\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`entry_history\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_key\` text NOT NULL,
  	\`entry_id\` integer NOT NULL,
  	\`revision\` numeric NOT NULL,
  	\`family_id\` text NOT NULL,
  	\`author_id\` integer NOT NULL,
  	\`editor_name\` text,
  	\`snapshot\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`entry_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`entry_history_version_key_idx\` ON \`entry_history\` (\`version_key\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entry_history_entry_idx\` ON \`entry_history\` (\`entry_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entry_history_family_id_idx\` ON \`entry_history\` (\`family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entry_history_author_idx\` ON \`entry_history\` (\`author_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entry_history_updated_at_idx\` ON \`entry_history\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entry_history_created_at_idx\` ON \`entry_history\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`family_services\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`family_id\` text NOT NULL,
  	\`enabled\` integer DEFAULT false,
  	\`endpoint\` text,
  	\`model\` text,
  	\`transcription_model\` text,
  	\`key_cipher\` text,
  	\`consent\` integer DEFAULT false,
  	\`consent_at\` text,
  	\`preserve_originals\` integer DEFAULT false,
  	\`last_export_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`family_services_family_id_idx\` ON \`family_services\` (\`family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`family_services_updated_at_idx\` ON \`family_services\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`family_services_created_at_idx\` ON \`family_services\` (\`created_at\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`entries\` ADD \`cover_media_id\` integer REFERENCES media(id);`,
  );
  await db.run(
    sql`ALTER TABLE \`entries\` ADD \`main_project_id\` integer REFERENCES projects(id);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_cover_media_idx\` ON \`entries\` (\`cover_media_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_main_project_idx\` ON \`entries\` (\`main_project_id\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`entries_rels\` ADD \`projects_id\` integer REFERENCES projects(id);`,
  );
  await db.run(
    sql`CREATE INDEX \`entries_rels_projects_id_idx\` ON \`entries_rels\` (\`projects_id\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`_entries_v\` ADD \`version_cover_media_id\` integer REFERENCES media(id);`,
  );
  await db.run(
    sql`ALTER TABLE \`_entries_v\` ADD \`version_main_project_id\` integer REFERENCES projects(id);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_cover_media_idx\` ON \`_entries_v\` (\`version_cover_media_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_version_version_main_project_idx\` ON \`_entries_v\` (\`version_main_project_id\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`_entries_v_rels\` ADD \`projects_id\` integer REFERENCES projects(id);`,
  );
  await db.run(
    sql`CREATE INDEX \`_entries_v_rels_projects_id_idx\` ON \`_entries_v_rels\` (\`projects_id\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`media\` ADD \`preserve_original\` integer DEFAULT false;`,
  );
  await db.run(sql`ALTER TABLE \`media\` ADD \`original_filename\` text;`);
  await db.run(sql`ALTER TABLE \`media\` ADD \`original_mime_type\` text;`);
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`spaces_id\` integer REFERENCES spaces(id);`,
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`projects_id\` integer REFERENCES projects(id);`,
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`entry_history_id\` integer REFERENCES entry_history(id);`,
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`family_services_id\` integer REFERENCES family_services(id);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_spaces_id_idx\` ON \`payload_locked_documents_rels\` (\`spaces_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_projects_id_idx\` ON \`payload_locked_documents_rels\` (\`projects_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_entry_history_id_idx\` ON \`payload_locked_documents_rels\` (\`entry_history_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_family_services_id_idx\` ON \`payload_locked_documents_rels\` (\`family_services_id\`);`,
  );
  // Preserve every native version still available before the 100-version cap
  // starts rotating again. Older versions already deleted cannot be recovered.
  let page = 1;
  while (true) {
    const versions = await payload.findVersions({
      collection: "entries",
      page,
      limit: 100,
      sort: "createdAt",
      depth: 0,
      overrideAccess: true,
      req,
    });
    for (const version of versions.docs) {
      const snapshot = version.version;
      const id = Number(version.parent);
      const author =
        typeof snapshot.author === "number"
          ? snapshot.author
          : snapshot.author?.id;
      if (!id || !author || !snapshot.familyId || !snapshot.revision) continue;
      const versionKey = `${id}:${snapshot.revision}`;
      const existing = await payload.find({
        collection: "entry-history",
        where: { versionKey: { equals: versionKey } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
        req,
      });
      if (!existing.docs.length)
        await payload.create({
          collection: "entry-history",
          data: {
            versionKey,
            entry: id,
            revision: snapshot.revision,
            familyId: snapshot.familyId,
            author,
            editorName: snapshot.editorName,
            snapshot: { ...snapshot },
            createdAt: version.createdAt,
          },
          overrideAccess: true,
          req,
        });
    }
    if (!versions.hasNextPage) break;
    page++;
  }
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`spaces_interests\`;`);
  await db.run(sql`DROP TABLE \`spaces\`;`);
  await db.run(sql`DROP TABLE \`projects\`;`);
  await db.run(sql`DROP TABLE \`entry_history\`;`);
  await db.run(sql`DROP TABLE \`family_services\`;`);
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
  	\`edited_by_id\` integer,
  	\`editor_name\` text,
  	\`client_id\` text NOT NULL,
  	\`revision\` numeric DEFAULT 1,
  	\`public_snapshot\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`edited_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_entries\`("id", "type", "title", "content", "reflection", "learning", "parent_note", "original_text", "occurred_at", "date_precision", "date_note", "retrospective", "status", "visibility", "public_requested", "review_status", "family_id", "author_id", "edited_by_id", "editor_name", "client_id", "revision", "public_snapshot", "updated_at", "created_at") SELECT "id", "type", "title", "content", "reflection", "learning", "parent_note", "original_text", "occurred_at", "date_precision", "date_note", "retrospective", "status", "visibility", "public_requested", "review_status", "family_id", "author_id", "edited_by_id", "editor_name", "client_id", "revision", "public_snapshot", "updated_at", "created_at" FROM \`entries\`;`,
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
    sql`CREATE INDEX \`entries_edited_by_idx\` ON \`entries\` (\`edited_by_id\`);`,
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
  await db.run(sql`CREATE TABLE \`__new_entries_rels\` (
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
    sql`INSERT INTO \`__new_entries_rels\`("id", "order", "parent_id", "path", "media_id") SELECT "id", "order", "parent_id", "path", "media_id" FROM \`entries_rels\`;`,
  );
  await db.run(sql`DROP TABLE \`entries_rels\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_entries_rels\` RENAME TO \`entries_rels\`;`,
  );
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
  	\`version_edited_by_id\` integer,
  	\`version_editor_name\` text,
  	\`version_client_id\` text NOT NULL,
  	\`version_revision\` numeric DEFAULT 1,
  	\`version_public_snapshot\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_edited_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new__entries_v\`("id", "parent_id", "version_type", "version_title", "version_content", "version_reflection", "version_learning", "version_parent_note", "version_original_text", "version_occurred_at", "version_date_precision", "version_date_note", "version_retrospective", "version_status", "version_visibility", "version_public_requested", "version_review_status", "version_family_id", "version_author_id", "version_edited_by_id", "version_editor_name", "version_client_id", "version_revision", "version_public_snapshot", "version_updated_at", "version_created_at", "created_at", "updated_at") SELECT "id", "parent_id", "version_type", "version_title", "version_content", "version_reflection", "version_learning", "version_parent_note", "version_original_text", "version_occurred_at", "version_date_precision", "version_date_note", "version_retrospective", "version_status", "version_visibility", "version_public_requested", "version_review_status", "version_family_id", "version_author_id", "version_edited_by_id", "version_editor_name", "version_client_id", "version_revision", "version_public_snapshot", "version_updated_at", "version_created_at", "created_at", "updated_at" FROM \`_entries_v\`;`,
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
    sql`CREATE INDEX \`_entries_v_version_version_edited_by_idx\` ON \`_entries_v\` (\`version_edited_by_id\`);`,
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
  await db.run(sql`CREATE TABLE \`__new__entries_v_rels\` (
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
    sql`INSERT INTO \`__new__entries_v_rels\`("id", "order", "parent_id", "path", "media_id") SELECT "id", "order", "parent_id", "path", "media_id" FROM \`_entries_v_rels\`;`,
  );
  await db.run(sql`DROP TABLE \`_entries_v_rels\`;`);
  await db.run(
    sql`ALTER TABLE \`__new__entries_v_rels\` RENAME TO \`_entries_v_rels\`;`,
  );
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
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
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
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "entries_id", "media_id") SELECT "id", "order", "parent_id", "path", "users_id", "entries_id", "media_id" FROM \`payload_locked_documents_rels\`;`,
  );
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`,
  );
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
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`preserve_original\`;`);
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`original_filename\`;`);
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`original_mime_type\`;`);
}
