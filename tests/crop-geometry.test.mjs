import test from "node:test"
import assert from "node:assert/strict"
import { cropSourceToWorkspace, cropWorkspaceToSource, moveCropRect, resizeCropRect } from "../src/lib/crop-geometry.mjs"

test("moving a crop frame clamps it inside the image", () => {
  assert.deepEqual(moveCropRect({ x: 20, y: 10, w: 40, h: 30 }, -50, 90, 100, 80), {
    x: 0,
    y: 50,
    w: 40,
    h: 30,
  })
})

test("resizing a corner preserves the opposite corner and image bounds", () => {
  assert.deepEqual(resizeCropRect({ x: 20, y: 10, w: 40, h: 30 }, "se", 80, 90, 100, 80), {
    x: 20,
    y: 10,
    w: 80,
    h: 70,
  })
})

test("resizing a locked crop keeps its aspect ratio", () => {
  const rect = resizeCropRect({ x: 20, y: 10, w: 40, h: 30 }, "se", 20, 40, 100, 80, 4 / 3)
  assert.equal(rect.w / rect.h, 4 / 3)
  assert.equal(rect.x, 20)
  assert.equal(rect.y, 10)
})

test("crop rectangles map through a 90 degree rotation and back", () => {
  const source = { x: 10, y: 20, w: 30, h: 40 }
  const workspace = cropSourceToWorkspace(source, 100, 80, 90, false, false)
  assert.deepEqual(workspace, { x: 20, y: 10, w: 40, h: 30 })
  assert.deepEqual(cropWorkspaceToSource(workspace, 100, 80, 90, false, false), source)
})

test("crop rectangle mapping accounts for horizontal and vertical flips", () => {
  const source = { x: 10, y: 20, w: 30, h: 40 }
  const workspace = cropSourceToWorkspace(source, 100, 80, 270, true, true)
  assert.deepEqual(cropWorkspaceToSource(workspace, 100, 80, 270, true, true), source)
})
