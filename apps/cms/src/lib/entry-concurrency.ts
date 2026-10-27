import { APIError } from "payload";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { sqliteAdapter } from "@payloadcms/db-sqlite";

export const entryConflict = () =>
  new APIError(
    "这条记录已有新版本。请重新打开后再保存，当前草稿仍在此设备。",
    409,
  );

/** Keep the revision claim, relationships and both histories in one transaction. */
export function withEntryConcurrency(
  adapter: ReturnType<typeof sqliteAdapter>,
) {
  const init = adapter.init;
  return {
    ...adapter,
    init: (options: Parameters<typeof init>[0]) => {
      const db = init(options);
      // SQLite has one writer. Serialize requests here and let SQLite arbitrate
      // the separate media process. Each attempt owns a connection so a failed
      // BEGIN cannot leave a pending statement on the next request's connection.
      let writers = Promise.resolve();
      db.beginTransaction = async () => {
        const previous = writers;
        let release!: () => void;
        writers = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        let client: ReturnType<typeof createClient> | undefined;
        try {
          await db.initializing;
          const deadline = Date.now() + 15000;
          while (true) {
            try {
              client = createClient(db.clientConfig);
              await client.execute("BEGIN IMMEDIATE");
              break;
            } catch (error) {
              client?.close();
              client = undefined;
              if (
                (error as { code?: string })?.code !== "SQLITE_BUSY" ||
                Date.now() >= deadline
              )
                throw error;
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          }
          const owned = client;
          const connection = drizzle(owned, {
            schema: db.schema,
            logger: db.logger || false,
          });
          const id = randomUUID();
          let ended = false;
          const finish = async (commit: boolean) => {
            if (ended) return;
            ended = true;
            try {
              if (commit) {
                try {
                  await owned.execute("COMMIT");
                } catch (error) {
                  try {
                    await owned.execute("ROLLBACK");
                  } catch {}
                  throw error;
                }
              } else await owned.execute("ROLLBACK");
            } finally {
              try {
                owned.close();
              } finally {
                release();
              }
            }
          };
          db.sessions[id] = {
            db: connection as unknown as (typeof db.sessions)[string]["db"],
            resolve: () => finish(true),
            reject: () => finish(false),
          };
          return id;
        } catch (error) {
          try {
            client?.close();
          } finally {
            release();
          }
          throw error;
        }
      };
      // Commit errors must propagate to the caller, including bulk imports.
      db.commitTransaction = async (incoming) => {
        const id = String(await incoming),
          session = db.sessions[id];
        if (!session) return;
        delete db.sessions[id];
        await session.resolve();
      };
      db.rollbackTransaction = async (incoming) => {
        const id = String(await incoming),
          session = db.sessions[id];
        if (!session) return;
        delete db.sessions[id];
        await session.reject();
      };
      const updateOne = db.updateOne.bind(db);
      db.updateOne = async (args) => {
        const revision = args.data.revision;
        if (
          args.collection !== "entries" ||
          args.id === undefined ||
          typeof revision !== "number" ||
          !Number.isSafeInteger(revision)
        )
          return updateOne(args);
        if (!(await args.req?.transactionID))
          throw new APIError("记录写入需要数据库事务，请稍后重试。", 503);

        const expected = revision - 1;
        const claimed = await updateOne({
          collection: "entries",
          data: { revision },
          where: {
            and: [
              { id: { equals: args.id } },
              expected === 0
                ? {
                    or: [
                      { revision: { equals: 0 } },
                      { revision: { exists: false } },
                    ],
                  }
                : { revision: { equals: expected } },
            ],
          },
          options: { atomic: true },
          req: args.req,
        });
        if (!claimed) throw entryConflict();
        return updateOne(args);
      };
      return db;
    },
  };
}
