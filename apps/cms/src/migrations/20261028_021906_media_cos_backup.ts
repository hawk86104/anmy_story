import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`storage_cleanup\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`family_id\` text NOT NULL,
  	\`object_key\` text NOT NULL,
  	\`storage\` text NOT NULL,
  	\`original\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`storage_cleanup_family_id_idx\` ON \`storage_cleanup\` (\`family_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`storage_cleanup_updated_at_idx\` ON \`storage_cleanup\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`storage_cleanup_created_at_idx\` ON \`storage_cleanup\` (\`created_at\`);`,
  );
  await db.run(
    sql`ALTER TABLE \`media\` ADD \`storage\` text DEFAULT 'local';`,
  );
  await db.run(sql`ALTER TABLE \`media\` ADD \`prefix\` text DEFAULT '';`);
  await db.run(sql`ALTER TABLE \`media\` ADD \`_objectkey\` text;`);
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`storage_cleanup_id\` integer REFERENCES storage_cleanup(id);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_storage_cleanup_id_idx\` ON \`payload_locked_documents_rels\` (\`storage_cleanup_id\`);`,
  );
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`storage_cleanup\`;`);
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`entries_id\` integer,
  	\`media_id\` integer,
  	\`spaces_id\` integer,
  	\`projects_id\` integer,
  	\`entry_history_id\` integer,
  	\`family_services_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`entries_id\`) REFERENCES \`entries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`spaces_id\`) REFERENCES \`spaces\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`projects_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`entry_history_id\`) REFERENCES \`entry_history\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`family_services_id\`) REFERENCES \`family_services\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "entries_id", "media_id", "spaces_id", "projects_id", "entry_history_id", "family_services_id") SELECT "id", "order", "parent_id", "path", "users_id", "entries_id", "media_id", "spaces_id", "projects_id", "entry_history_id", "family_services_id" FROM \`payload_locked_documents_rels\`;`,
  );
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`,
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
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
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`storage\`;`);
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`prefix\`;`);
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`_objectkey\`;`);
}
