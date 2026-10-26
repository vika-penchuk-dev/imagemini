export interface LatestTaskGate {
  next(): number
  invalidate(): number
  isCurrent(candidate: number): boolean
}
export function createLatestTaskGate(): LatestTaskGate
