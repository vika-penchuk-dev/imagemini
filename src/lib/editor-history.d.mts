export function createEditorHistory<T>(maxEntries?: number): {
  push(snapshot: T): void
  undo(current: T): T | undefined
  redo(current: T): T | undefined
  clear(): void
  setLimit(maxEntries: number): void
  readonly canUndo: boolean
  readonly canRedo: boolean
}
export function createStrokeHistory<T>(maxEntries?: number): {
  begin(snapshot: T): void
  update(snapshot: T): void
  finish(): boolean
  undo(current: T): T | undefined
  redo(current: T): T | undefined
  clear(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
}
export function createStrokeHistory<T>(maxEntries?: number): {
  begin(snapshot: T): void
  update(snapshot: T): void
  finish(): boolean
  undo(current: T): T | undefined
  redo(current: T): T | undefined
  clear(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
}
