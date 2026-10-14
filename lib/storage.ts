import type { IdeaRecord } from "./idea";
const DB = "idea-note";
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("records", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "기기 저장소를 열 수 없어요. 브라우저의 저장 권한을 확인해주세요.",
        ),
      );
    request.onblocked = () =>
      reject(new Error("다른 탭을 닫고 다시 시도해주세요."));
  });
}
export async function listHistory(): Promise<IdeaRecord[]> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readonly");
      const request = tx.objectStore("records").getAll();
      tx.oncomplete = () =>
        resolve(
          (request.result as IdeaRecord[]).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          ),
        );
      tx.onerror = () =>
        reject(new Error("기록을 읽지 못했어요. 다시 시도해주세요."));
    });
  } finally {
    db.close();
  }
}
export async function putRecord(
  record: IdeaRecord,
  save = false,
): Promise<IdeaRecord> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      const request = store.get(record.id);
      let next = record;
      request.onsuccess = () => {
        const existing = request.result as IdeaRecord | undefined;
        next = {
          ...record,
          savedAt:
            existing?.savedAt ||
            record.savedAt ||
            (save ? new Date().toISOString() : null),
        };
        store.put(next);
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = tx.onabort = () =>
        reject(
          new Error(
            "기기에 저장하지 못했어요. 현재 결과는 유지됩니다. 저장 공간과 권한을 확인한 뒤 다시 시도해주세요.",
          ),
        );
    });
  } finally {
    db.close();
  }
}
