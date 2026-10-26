import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { drawEditorCanvasBase } from "../src/lib/editor-canvas.mjs"
import { createEditorHistory } from "../src/lib/editor-history.mjs"

test("shared editor canvas rendering clears the target and draws only the supplied image", () => {
  const operations = []
  const context = {
    clearRect: (...args) => operations.push(["clearRect", ...args]),
    drawImage: (...args) => operations.push(["drawImage", ...args]),
    fillText: (...args) => operations.push(["fillText", ...args]),
    stroke: (...args) => operations.push(["stroke", ...args]),
  }
  const source = { width: 120, height: 80 }

  drawEditorCanvasBase(context, source)

  assert.deepEqual(operations, [["clearRect", 0, 0, 120, 80], ["drawImage", source, 0, 0]])
})

test("editor undo and redo restore clean canvas snapshots without overlay state", () => {
  const history = createEditorHistory(4)
  const original = { id: "original" }
  const edited = { id: "patched" }
  history.push(original)

  assert.equal(history.undo(edited), original)
  assert.equal(history.redo(original), edited)
  assert.deepEqual(Object.keys(edited), ["id"])
})

test("text layers are not connected to the active editor history, renderers, or exports", async () => {
  const activePaths = [
    "../src/components/editor-session.tsx",
    "../src/components/layer-workspace.tsx",
    "../src/components/patch-workspace.tsx",
    "../src/pages/edit.tsx",
  ]
  const contents = await Promise.all(activePaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))

  assert.doesNotMatch(contents[0], /TextLayer|textLayers|commitTextLayers/)
  assert.doesNotMatch(contents[1], /drawTextLayers|compositeCanvasWithText|textLayers/)
  assert.doesNotMatch(contents[2], /drawTextLayers|compositeCanvasWithText|textLayers/)
  assert.doesNotMatch(contents[3], /TextWorkspace|drawTextLayers|compositeCanvasWithText|transformTextLayers|editorMode.*text/)
})
