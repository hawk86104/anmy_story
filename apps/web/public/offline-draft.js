(() => {
  const DATABASE = "mylife-offline-v1";
  const STORE = "drafts";
  const form = document.querySelector("#offline-form");
  const status = document.querySelector("#status");
  const fields = ["title", "content", "occurredAt"];
  let timer,
    savedVersion,
    ready = false,
    chain = Promise.resolve(true);
  document.querySelectorAll("input,textarea,button").forEach((field) => {
    field.disabled = true;
  });
  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function transaction(mode, action) {
    const db = await database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode),
        request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  const snapshot = () =>
    Object.fromEntries(
      fields.map((name) => [name, document.getElementById(name).value]),
    );
  function save() {
    clearTimeout(timer);
    if (!ready) return;
    const data = {
      ...snapshot(),
      updatedAt: new Date().toISOString(),
      version: crypto.randomUUID(),
    };
    const empty = !data.title.trim() && !data.content.trim();
    let conflict = false;
    chain = chain
      .catch(() => {})
      .then(async () => {
        await transaction("readwrite", (store) => {
          const request = store.get("current");
          request.onsuccess = () => {
            if (request.result?.version !== savedVersion) {
              conflict = true;
              store.transaction.abort();
              return;
            }
            if (empty) store.delete("current");
            else store.put(data, "current");
          };
          return request;
        });
        savedVersion = empty ? undefined : data.version;
        status.textContent = empty
          ? "离线草稿已清空。"
          : "文字已存到这台设备，联网后可带回编辑器。";
        return true;
      })
      .catch(() => {
        status.textContent = conflict
          ? "这份草稿已在另一个页面更新，请先复制当前文字，再重新打开。"
          : "设备空间不足或不允许保存，请复制文字后保管。";
        return false;
      });
    return chain;
  }
  database
    .then(() => transaction("readonly", (store) => store.get("current")))
    .then((draft) => {
      if (draft) {
        for (const name of fields)
          document.getElementById(name).value = draft[name] || "";
        savedVersion = draft.version;
      }
      ready = true;
      document.querySelectorAll("input,textarea,button").forEach((field) => {
        field.disabled = false;
      });
      status.textContent = draft
        ? "已经接上这台设备上未完成的离线草稿。"
        : "可以开始写了，文字会自动保存在这台设备。";
    })
    .catch(() => {
      status.textContent = "这台设备暂时不能保存草稿，请复制文字后保管。";
    });
  form.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
  document.querySelector("#clear").addEventListener("click", async () => {
    for (const name of fields) document.getElementById(name).value = "";
    await save();
  });
  document
    .querySelector('a[href="/app/new"]')
    .addEventListener("click", (event) => {
      if (!ready) return;
      event.preventDefault();
      Promise.resolve(save()).then((saved) => {
        if (saved) location.href = "/app/new";
      });
    });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void save();
  });
  window.addEventListener("pagehide", () => {
    void save();
  });
})();
