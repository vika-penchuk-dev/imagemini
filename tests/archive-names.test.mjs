import test from "node:test"
import assert from "node:assert/strict"
import { uniqueArchiveName } from "../src/lib/archive-names.mjs"

test("archive names keep Cyrillic extensions and avoid Windows-invalid characters", () => {
  assert.equal(uniqueArchiveName("Фото: тест?.webp", new Set()), "Фото_ тест_.webp")
})

test("archive names are unique case-insensitively for Windows extraction", () => {
  const used = new Set()
  assert.equal(uniqueArchiveName("Фото.png", used), "Фото.png")
  assert.equal(uniqueArchiveName("фото.PNG", used), "фото_1.PNG")
})
