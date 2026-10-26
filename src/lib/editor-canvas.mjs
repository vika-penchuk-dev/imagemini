export function drawEditorCanvasBase(context, source) {
  context.clearRect(0, 0, source.width, source.height)
  context.drawImage(source, 0, 0)
}
