const STORAGE_KEY = "imagemini.sidebar.collapsed"

function getStorage() {
  try { return globalThis.localStorage } catch { return null }
}

export function readSidebarCollapsed(storage = getStorage()) {
  try { return storage?.getItem(STORAGE_KEY) === "true" } catch { return false }
}

export function writeSidebarCollapsed(collapsed, storage = getStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, String(Boolean(collapsed)))
    return !!storage
  } catch {
    return false
  }
}
