declare module "onnxruntime-web" {
  export class Tensor {
    constructor(type: "float32", data: Float32Array, dims: number[])
  }
  export class InferenceSession {
    static create(model: Uint8Array, options: { executionProviders: string[]; graphOptimizationLevel: string }): Promise<InferenceSession>
    readonly inputNames: string[]
    readonly outputNames: string[]
    run(inputs: Record<string, Tensor>): Promise<Record<string, Tensor & { data: Float32Array; dims: number[] }>>
    release(): Promise<void>
  }
  export const env: { wasm: { numThreads: number; wasmPaths: string | { wasm?: string; mjs?: string } } }
}

declare module "onnxruntime-web/wasm" {
  export * from "onnxruntime-web"
}

declare module "onnxruntime-web/webgpu" {
  export * from "onnxruntime-web"
}
