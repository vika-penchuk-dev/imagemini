# ImageMini — Image Processing & Photo Editing

A browser-based toolkit for processing and editing images. ImageMini runs image operations locally in your browser, with Web Workers used for selected CPU-intensive tasks and background removal.

[Русская версия](README.ru.md)

## Overview

ImageMini combines everyday image processing with a focused photo editor. It was built to keep source images on the user's device while providing a practical set of editing and batch tools.

## Features

- Image compression for JPEG, WebP, and lossless PNG optimization
- Conversion between JPEG, PNG, and WebP
- Image enhancement with adjustable controls and presets
- Image resizing and Lanczos interpolation upscaling
- Local AI background removal with BiRefNet Lite 512
- Editor tools for crop, rotate, and flip
- Patch tool with Flat and Texture modes
- Lasso selections and temporary image layers
- Soft and hard erasers for temporary layers
- Batch processing with progress, cancellation, and ZIP export
- Russian and English interface
- Light, dark, and system themes

Lanczos upscaling is interpolation; it is not AI super-resolution. The text tool is currently disabled.

## Screenshots and demo

Screenshots and the editor GIF are not included yet. The available browser session could not reach the local development server, so no authentic application captures could be recorded here. See [`docs/media/RECORDING.md`](docs/media/RECORDING.md) for the reproducible capture plan. No mock screenshots are used.

## Tech stack

- React 19 and TypeScript
- Vite 7
- Tailwind CSS 4 and Radix UI
- ONNX Runtime Web 1.21.0
- Canvas 2D and Web Workers
- fflate for ZIP output and PNG optimization

## Getting started

Requires Node.js 20 or newer.

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. To create and preview a production build:

```powershell
npm run build
npm run preview
```

## Background removal

ImageMini downloads BiRefNet Lite 512 on first use from a pinned Hugging Face revision. The model is about 98.5 MB and is not stored in this repository. ImageMini checks the downloaded bytes against a pinned SHA-256 digest and caches the verified model with the browser Cache API. Images are processed locally. A compatible WebGPU backend is used when available; otherwise ONNX Runtime Web uses WASM, which may be slow on CPU-only devices. The model weights are MIT licensed; required copyright notices are in [`public/licenses/BiRefNet-LICENSE.txt`](public/licenses/BiRefNet-LICENSE.txt). ONNX Runtime Web's MIT notice is in [`public/licenses/ONNX-Runtime-LICENSE.txt`](public/licenses/ONNX-Runtime-LICENSE.txt). See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Architecture

The application is organized as a Vite SPA. `src/pages/` contains operation screens, `src/components/` contains shared UI and editor workspaces, and `src/lib/` contains image processing, geometry, file output, localization, and worker code. Canvas 2D handles most transformations. Background removal, enhancement previews, resizing, patching, and other selected operations run in Web Workers to keep work off the UI thread. The background removal worker lazily initializes ONNX Runtime Web and downloads and verifies the model only when needed. More detail is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Testing

Run the project's checks with:

```powershell
npm run typecheck
npm test
npm run build
```

Results from the release-preparation run:

- `npm run typecheck` — не выполнен: после неудачного `npm ci` локальная команда `tsc` отсутствует.
- `npm test` — 58 пройдено, 1 не пройден: не найден установленный пакет `fflate` после частичной очистки npm.
- `npm run build` — не выполнена: локальная команда `tsc` отсутствует.

## Limitations

- WASM background removal can take tens of seconds on CPU-only devices.
- Patch quality depends on the chosen donor area; complex textures and lighting can leave visible seams.
- Large images and Lanczos upscaling can take several seconds and are bounded by browser canvas limits.
- AVIF, HEIC, and TIFF input depend on browser decoder support.
- Vite currently reports that the main JavaScript chunk exceeds its 500 kB warning threshold.

## License

The project currently contains a proposed MIT license in [`LICENSE`](LICENSE). Review and approve it before public release. Third-party notices are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Author

[vika-penchuk-dev on GitHub](https://github.com/vika-penchuk-dev).



