import test from "node:test"
import assert from "node:assert/strict"
import { compositeCanvasWithText, drawTextLayers, editorFontStack, transformTextLayers } from "../src/lib/editor-text.mjs"

function createContext() {
  const calls = []
  return {
    calls,
    save() { calls.push(["save"]) },
    restore() { calls.push(["restore"]) },
    translate(...args) { calls.push(["translate", ...args]) },
    rotate(...args) { calls.push(["rotate", ...args]) },
    fillText(...args) { calls.push(["fillText", ...args]) },
  }
}

test("text layers draw multiline text with selected typography, alpha, and rotation", () => {
  const context = createContext()
  drawTextLayers(context, [{ id: "a", text: "Привет\nImageMini", x: 20, y: 30, fontFamily: "Arial", fontSize: 24, color: "#123456", bold: true, italic: true, opacity: 45, angle: 30 }])
  assert.equal(context.globalAlpha, 0.45)
  assert.equal(context.fillStyle, "#123456")
  assert.equal(context.font, "italic bold 24px \"Arial\", sans-serif")
  assert.ok(context.calls.some(([name, ...args]) => name === "rotate" && Math.abs(args[0] - Math.PI / 6) < 1e-10))
  const lines = context.calls.filter(([name]) => name === "fillText").map(([, ...args]) => args)
  assert.deepEqual(lines[0], ["Привет", 0, 0])
  assert.deepEqual(lines[1].slice(0, 2), ["ImageMini", 0])
  assert.ok(Math.abs(lines[1][2] - 28.8) < 1e-10)
})

test("text positions and angles follow crop, quarter turn, and reflection", () => {
  const [layer] = transformTextLayers([{ id: "a", text: "X", x: 20, y: 30, fontFamily: "Arial", fontSize: 20, color: "black", bold: false, italic: false, opacity: 100, angle: 10 }], {
    sourceWidth: 100, sourceHeight: 80, crop: { x: 10, y: 5, w: 80, h: 60 }, rotate: 90, flipH: true, flipV: false,
  })
  assert.equal(layer.x, 25)
  assert.equal(layer.y, 10)
  assert.equal(layer.angle, 80)
})

test("empty text layers leave the image canvas untouched", () => {
  const context = createContext()
  drawTextLayers(context, [])
  assert.deepEqual(context.calls, [])
})

test("font choices provide a generic fallback when the named font is unavailable", () => {
  assert.equal(editorFontStack("Times New Roman"), '"Times New Roman", serif')
  assert.equal(editorFontStack("Courier New"), '"Courier New", monospace')
  assert.equal(editorFontStack("Tahoma"), '"Tahoma", sans-serif')
})

test("text composite keeps source pixel dimensions and draws onto a new canvas", () => {
  const previousDocument = globalThis.document
  const operations = []
  const output = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => operations.push(["drawImage", ...args]), save() {}, restore() {}, translate() {}, rotate() {}, fillText() {} }) }
  globalThis.document = { createElement: (tag) => { assert.equal(tag, "canvas"); return output } }
  try {
    const source = { width: 321, height: 123 }
    const composite = compositeCanvasWithText(source, [])
    assert.equal(composite.width, 321)
    assert.equal(composite.height, 123)
    assert.deepEqual(operations, [["drawImage", source, 0, 0]])
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
