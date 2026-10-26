# ImageMini — Image Processing & Photo Editing

A browser-based toolkit for processing and editing images. ImageMini runs image operations locally in your browser, with Web Workers used for selected CPU-intensive tasks.

[Русская версия](README.ru.md)

## Overview

ImageMini combines everyday image processing with a focused photo editor. It was built to keep source images on the user's device while providing a practical set of editing and batch tools.

## Features

- Image compression for JPEG, WebP, and lossless PNG optimization
- Conversion between JPEG, PNG, and WebP
- Image enhancement with adjustable controls and presets
- Image resizing and Lanczos interpolation upscaling
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

## Architecture

The application is organized as a Vite SPA. `src/pages/` contains operation screens, `src/components/` contains shared UI and editor workspaces, and `src/lib/` contains image processing, geometry, file output, localization, and worker code. Canvas 2D handles most transformations. Enhancement previews, resizing, patching, and other selected operations run in Web Workers to keep work off the UI thread. More detail is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Testing

Run the project's checks with:

```powershell
npm run typecheck
npm test
npm run build
```

Release checks (2026-10-26): `npm run typecheck` passed, `npm test` passed (64/64), `npm run build` passed, and `npm audit` reported 0 vulnerabilities.

## Limitations

- Patch quality depends on the chosen donor area; complex textures and lighting can leave visible seams.
- Large images and Lanczos upscaling can take several seconds and are bounded by browser canvas limits.
- AVIF, HEIC, and TIFF input depend on browser decoder support.
- Vite currently reports that the main JavaScript chunk exceeds its 500 kB warning threshold.

## License

The project currently contains a proposed MIT license in [`LICENSE`](LICENSE). Review and approve it before public release. Third-party notices are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Author

[vika-penchuk-dev on GitHub](https://github.com/vika-penchuk-dev).



