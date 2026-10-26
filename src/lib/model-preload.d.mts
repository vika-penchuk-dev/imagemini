export function createPreloadManager(load: () => Promise<unknown>): () => Promise<boolean>
