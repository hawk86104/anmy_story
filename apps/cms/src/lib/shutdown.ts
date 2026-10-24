import type { Payload } from "payload";
import type { SQLiteAdapter } from "@payloadcms/db-sqlite";
export async function closePayload(payload: Payload) {
  const client = (payload.db as unknown as SQLiteAdapter).client;
  await payload.destroy();
  client.close();
}
