export function createEditorHistory(maxEntries = 20) {
  let limit = maxEntries
  const undo = []
  const redo = []
  return {
    push(snapshot) {
      undo.push(snapshot)
      if (undo.length > limit) undo.shift()
      redo.length = 0
    },
    undo(current) {
      const previous = undo.pop()
      if (previous === undefined) return undefined
      redo.push(current)
      return previous
    },
    redo(current) {
      const next = redo.pop()
      if (next === undefined) return undefined
      undo.push(current)
      return next
    },
    clear() { undo.length = 0; redo.length = 0 },
    setLimit(next) { limit = Math.max(1, next); while (undo.length > limit) undo.shift() },
    get canUndo() { return undo.length > 0 },
    get canRedo() { return redo.length > 0 },
  }
}

export function createStrokeHistory(maxEntries = 20) {
  const history = createEditorHistory(maxEntries)
  let beforeStroke
  return {
    begin(snapshot) {
      if (beforeStroke === undefined) beforeStroke = snapshot
    },
    update(_snapshot) {},
    finish() {
      if (beforeStroke === undefined) return false
      history.push(beforeStroke)
      beforeStroke = undefined
      return true
    },
    undo(current) { return history.undo(current) },
    redo(current) { return history.redo(current) },
    clear() { beforeStroke = undefined; history.clear() },
    get canUndo() { return history.canUndo },
    get canRedo() { return history.canRedo },
  }
}
