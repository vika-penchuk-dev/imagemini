import test from "node:test"
import assert from "node:assert/strict"
import { editorResetButtonLabel } from "../src/lib/editor-ui-copy.mjs"

test("editor reset action uses a concise localized button label", () => {
  assert.equal(editorResetButtonLabel("ru"), "Сбросить")
  assert.equal(editorResetButtonLabel("en"), "Reset")
})
