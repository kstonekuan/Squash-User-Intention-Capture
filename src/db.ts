import type { DBChunk, RawEvent, WorkflowHistoryEntry } from './types';

const DB_NAME = 'workflow-db';
const STORE_NAME = 'chunks';
const HISTORY_STORE_NAME = 'history';
const DB_VERSION = 2;

let db: IDBDatabase | null = null;

export async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }

      if (!database.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        const historyStore = database.createObjectStore(HISTORY_STORE_NAME, {
          keyPath: 'id',
        });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

export async function saveChunk(events: RawEvent[]): Promise<void> {
  if (!events.length) return;

  const database = await openDB();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const chunk: DBChunk = {
    timestamp: Date.now(),
    events,
  };

  return new Promise((resolve, reject) => {
    const request = store.add(chunk);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllChunks(): Promise<DBChunk[]> {
  const database = await openDB();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllChunks(): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// History management functions
export async function saveHistoryEntry(entry: WorkflowHistoryEntry): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(HISTORY_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.add(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllHistoryEntries(): Promise<WorkflowHistoryEntry[]> {
  const database = await openDB();
  const transaction = database.transaction(HISTORY_STORE_NAME, 'readonly');
  const store = transaction.objectStore(HISTORY_STORE_NAME);
  const index = store.index('timestamp');

  return new Promise((resolve, reject) => {
    const request = index.getAll();

    request.onsuccess = () => {
      // Sort by timestamp descending (newest first)
      const results = request.result.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(HISTORY_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllHistory(): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(HISTORY_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
