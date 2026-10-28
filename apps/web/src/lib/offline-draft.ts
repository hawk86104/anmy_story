export type OfflineDraft = {
  title: string;
  content: string;
  occurredAt: string;
  updatedAt: string;
  version: string;
};

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("mylife-offline-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readOfflineDraft(): Promise<OfflineDraft | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const request = tx.objectStore("drafts").get("current");
    tx.oncomplete = () => {
      db.close();
      const value = request.result;
      resolve(
        value &&
          typeof value.title === "string" &&
          value.title.length <= 160 &&
          typeof value.content === "string" &&
          value.content.length <= 50000 &&
          typeof value.occurredAt === "string" &&
          typeof value.updatedAt === "string" &&
          typeof value.version === "string"
          ? value
          : undefined,
      );
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function removeOfflineDraft(expected: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite"),
      store = tx.objectStore("drafts");
    const request = store.get("current");
    request.onsuccess = () => {
      if (request.result?.version === expected) store.delete("current");
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
