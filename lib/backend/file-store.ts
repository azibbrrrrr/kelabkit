// File bytes for the demo backend, in IndexedDB (`kelabkit-files-v1`, one store keyed by
// attachment id). Metadata stays in the snapshot. Phase 2 replaces this with private object
// storage; nothing outside lib/backend should import it.

import { KelabError } from "@/lib/errors";

const DB_NAME = "kelabkit-files-v1";
const STORE = "files";

let opened: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opened) return opened;
  opened = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new KelabError("FILE_STORAGE_UNAVAILABLE"));
      request.onblocked = () => reject(new KelabError("FILE_STORAGE_UNAVAILABLE"));
    } catch {
      reject(new KelabError("FILE_STORAGE_UNAVAILABLE"));
    }
  }).catch((error) => {
    opened = null; // allow a retry once the browser lets IndexedDB through
    throw error;
  });
  return opened;
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      let result: T;
      request.onsuccess = () => (result = request.result);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new KelabError("FILE_STORAGE_UNAVAILABLE"));
      tx.onabort = () => reject(new KelabError("FILE_STORAGE_UNAVAILABLE"));
    } catch {
      reject(new KelabError("FILE_STORAGE_UNAVAILABLE"));
    }
  });
}

export const putFile = (id: string, blob: Blob) => withStore("readwrite", (store) => store.put(blob, id)).then(() => undefined);
export const getFile = (id: string) => withStore<Blob | undefined>("readonly", (store) => store.get(id)).then((blob) => blob ?? null);
export const deleteFile = (id: string) => withStore("readwrite", (store) => store.delete(id)).then(() => undefined);
export const clearFiles = () => withStore("readwrite", (store) => store.clear()).then(() => undefined);
