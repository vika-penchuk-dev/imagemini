export function createPreloadManager(load) {
  let promise = null
  return () => {
    if (!promise) {
      promise = Promise.resolve()
        .then(load)
        .then(() => true)
        .catch(() => {
          promise = null
          return false
        })
    }
    return promise
  }
}
