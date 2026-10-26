import { decontaminateEdges, imageDataToInputTensor, logitsToAlpha } from "./bg-removal-core.mjs"

const MODEL_KEY = "/__imagemini_cache__/birefnet-lite-512-962e67969ec6acec9c19fab76acee4f5e22e990c-fp16.onnx"
const MODEL_HASH = "eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516"
const MODEL_URL = "https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/onnx/model_fp16.onnx?download=true"
const MODEL_DEV_URL = "/_local_debug/model_fp16.onnx"

type WorkerRequest = { type: "load" } | { type: "run"; bitmap: ImageBitmap }
type WorkerResponse =
  | { type: "status"; status: "loading" | "downloading" | "ready" | "processing"; stage?: "preparing" | "segmenting" | "finishing"; loaded?: number; total?: number; provider?: string; offlineAvailable?: boolean }
  | { type: "result"; pixels: ArrayBuffer; width: number; height: number; provider: string }
  | { type: "error"; code: "load" | "process"; debug?: string }

const worker = self as unknown as {
  location: Location
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}
let session: import("onnxruntime-web").InferenceSession | null = null
let provider = ""
let loadPromise: Promise<void> | null = null
let offlineAvailable = false

async function resetSession() {
  const previous = session
  session = null
  provider = ""
  loadPromise = null
  if (previous) try { await previous.release() } catch { /* the failed session is no longer reused */ }
}

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  worker.postMessage(message, transfer)
}

function disposeTensor(tensor: unknown) {
  try { (tensor as { dispose?: () => void }).dispose?.() } catch { /* cleanup must not mask the processing result */ }
}

async function getModelBytes(): Promise<Uint8Array> {
  const cache = await caches.open("imagemini-models-v1")
  const key = new Request(new URL(MODEL_KEY, worker.location.origin))
  let response = await cache.match(key)
  let bytes: Uint8Array
  if (!response) {
    const source = import.meta.env.DEV ? MODEL_DEV_URL : MODEL_URL
    const downloaded = await fetch(source)
    if (!downloaded.ok || !downloaded.body) throw new Error("download")
    const total = Number(downloaded.headers.get("content-length")) || 0
    const reader = downloaded.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      post({ type: "status", status: "downloading", loaded, total })
    }
    bytes = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    try {
      await cache.put(key, new Response(bytes.slice().buffer, { headers: { "Content-Type": "application/octet-stream" } }))
      offlineAvailable = true
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Model cache unavailable", error)
      offlineAvailable = false
    }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer())
    offlineAvailable = true
  }
  post({ type: "status", status: "loading" })
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer))
  const hash = [...digest].map((v) => v.toString(16).padStart(2, "0")).join("")
  if (hash !== MODEL_HASH) {
    await cache.delete(key)
    throw new Error("integrity")
  }
  return bytes
}

async function makeSession(bytes: Uint8Array, executionProviders: string[]) {
  const ort = executionProviders[0] === "webgpu"
    ? await import("onnxruntime-web/webgpu")
    : await import("onnxruntime-web/wasm")
  ort.env.wasm.numThreads = 1
  const path = (name: string) => new URL(`/ort/${name}`, worker.location.origin).href
  ort.env.wasm.wasmPaths = executionProviders[0] === "webgpu"
    ? { mjs: path("ort-wasm-simd-threaded.jsep.mjs") }
    : { wasm: path("ort-wasm-simd-threaded.wasm"), mjs: path("ort-wasm-simd-threaded.mjs") }
  return ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders, graphOptimizationLevel: "all" })
}

async function load() {
  if (session) return
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    post({ type: "status", status: "loading" })
    const bytes = await getModelBytes()
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
    let adapter: unknown = null
    try { adapter = await gpu?.requestAdapter() ?? null } catch { /* use the verified WASM backend */ }
    if (adapter) {
      try {
        session = await makeSession(bytes, ["webgpu"])
        provider = "webgpu"
      } catch {
        session = await makeSession(bytes, ["wasm"])
        provider = "wasm"
      }
    } else {
      session = await makeSession(bytes, ["wasm"])
      provider = "wasm"
    }
    if (session.inputNames[0] !== "input_image" || !session.outputNames[0]) {
      await session.release()
      session = null
      throw new Error("shape")
    }
    post({ type: "status", status: "ready", provider, offlineAvailable })
  })().catch(async (error) => {
    if (import.meta.env.DEV) console.error("Background model initialization failed", error)
    await resetSession()
    throw error
  })
  return loadPromise
}

async function run(bitmap: ImageBitmap) {
  let input: import("onnxruntime-web").Tensor | null = null
  let output: Record<string, import("onnxruntime-web").Tensor & { data: Float32Array; dims: number[] }> | null = null
  let failed = false
  try {
    post({ type: "status", status: "processing", stage: "preparing" })
    await load()
    if (!session) throw new Error("session")
    const small = new OffscreenCanvas(512, 512)
    const smallContext = small.getContext("2d", { willReadFrequently: true })!
    smallContext.drawImage(bitmap, 0, 0, 512, 512)
    const inputData = smallContext.getImageData(0, 0, 512, 512)
    const ort = provider === "webgpu"
      ? await import("onnxruntime-web/webgpu")
      : await import("onnxruntime-web/wasm")
    input = new ort.Tensor("float32", imageDataToInputTensor(inputData), [1, 3, 512, 512])
    post({ type: "status", status: "processing", stage: "segmenting" })
    try {
      output = await session.run({ input_image: input })
    } catch {
      if (provider !== "webgpu") throw new Error("inference")
      await session.release()
      session = await makeSession(await getModelBytes(), ["wasm"])
      provider = "wasm"
      output = await session.run({ input_image: input })
      post({ type: "status", status: "ready", provider, offlineAvailable })
    }
    post({ type: "status", status: "processing", stage: "finishing" })
    const result = output[session.outputNames[0]]
    const width = bitmap.width
    const height = bitmap.height
    const alpha = logitsToAlpha(result.data as Float32Array, result.dims[3], result.dims[2], width, height)
    const fullCanvas = new OffscreenCanvas(width, height)
    const context = fullCanvas.getContext("2d", { willReadFrequently: true })!
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, width, height)
    const corrected = decontaminateEdges(pixels.data, alpha, width, height)
    pixels.data.set(corrected)
    for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i]
    post({ type: "result", pixels: pixels.data.buffer, width, height, provider }, [pixels.data.buffer])
  } catch (error) {
    if (import.meta.env.DEV) console.error("Background model processing failed", error)
    failed = true
  } finally {
    if (input) disposeTensor(input)
    if (output) for (const tensor of Object.values(output)) disposeTensor(tensor)
    bitmap.close()
  }
  if (failed) {
    await resetSession()
    post({ type: "error", code: "process" })
  }
}

worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === "load") {
    void load().catch((error) => post({ type: "error", code: "load", debug: String(error) }))
  } else if (event.data.type === "run") {
    void run(event.data.bitmap)
  }
}
