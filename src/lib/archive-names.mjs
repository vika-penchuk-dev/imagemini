export function uniqueArchiveName(input, usedNames) {
  const cleaned = input
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "") || "image"
  const dot = cleaned.lastIndexOf(".")
  const base = dot > 0 ? cleaned.slice(0, dot) : cleaned
  const extension = dot > 0 ? cleaned.slice(dot) : ""
  let name = cleaned
  let suffix = 1
  while (usedNames.has(name.toLocaleLowerCase("en-US"))) {
    name = `${base}_${suffix}${extension}`
    suffix += 1
  }
  usedNames.add(name.toLocaleLowerCase("en-US"))
  return name
}
