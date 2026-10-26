export function createLatestTaskGate() {
  let current = 0
  return {
    next: () => ++current,
    invalidate: () => ++current,
    isCurrent: (candidate) => candidate === current,
  }
}
