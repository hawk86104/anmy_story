import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`spaces\` ADD \`entry_tag_options\` text DEFAULT '["日常小事","新的尝试","我的作品","运动一下","读书时光","小小进步"]';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`spaces\` DROP COLUMN \`entry_tag_options\`;`)
}
