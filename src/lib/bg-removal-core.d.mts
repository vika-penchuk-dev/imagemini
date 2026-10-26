export function imageDataToInputTensor(imageData: ImageData): Float32Array
export function logitsToAlpha(logits: Float32Array, width: number, height: number, outputWidth: number, outputHeight: number): Uint8ClampedArray
export function decontaminateEdges(rgba: Uint8ClampedArray, alpha: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray
