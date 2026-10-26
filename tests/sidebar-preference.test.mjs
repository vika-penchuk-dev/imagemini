import test from "node:test"
import assert from "node:assert/strict"

test("sidebar preference defaults safely and persists only an explicit collapse", async () => {
  const preference = await import("../src/lib/sidebar-preference.mjs").catch(() => null)
  assert.equal(typeof preference?.readSidebarCollapsed, "function")
  assert.equal(typeof preference?.writeSidebarCollapsed, "function")
  if (typeof preference?.readSidebarCollapsed !== "function" || typeof preference?.writeSidebarCollapsed !== "function") return

  assert.equal(preference.readSidebarCollapsed({ getItem: () => null }), false)
  assert.equal(preference.readSidebarCollapsed({ getItem: () => "true" }), true)
  assert.equal(preference.readSidebarCollapsed({ getItem: () => "false" }), false)
  assert.equal(preference.readSidebarCollapsed({ getItem: () => "invalid" }), false)
  assert.equal(preference.readSidebarCollapsed({ getItem: () => { throw new Error("storage disabled") } }), false)

  const writes = []
  assert.equal(preference.writeSidebarCollapsed(true, { setItem: (...args) => writes.push(args) }), true)
  assert.deepEqual(writes, [["imagemini.sidebar.collapsed", "true"]])
  assert.equal(preference.writeSidebarCollapsed(false, { setItem: () => { throw new Error("storage disabled") } }), false)
})
