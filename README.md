# ImageMini — Browser-Based Image Processing MVP

**English** | [Русский](README.ru.md)

ImageMini is a working browser-based MVP for everyday image processing. It compresses, converts, enhances, resizes, and edits images locally in your browser.

## Screenshots

<p align="center"><a href="docs/media/01-home.png"><img src="docs/media/01-home.png" alt="ImageMini home page in the light theme, with image tools and upload area" width="100%"></a></p>
<p align="center"><sub>Home page · Light theme</sub></p>

<table>
  <tr>
    <td align="center" width="50%"><a href="docs/media/02-enhancement.png"><img src="docs/media/02-enhancement.png" alt="Image enhancement screen comparing the original and adjusted photo" width="100%"></a><br><sub>Enhancement · Before and after</sub></td>
    <td align="center" width="50%"><a href="docs/media/03-upscale.png"><img src="docs/media/03-upscale.png" alt="Husky image enlarged 4 times in the dark theme" width="100%"></a><br><sub>4× Lanczos upscaling · Dark theme</sub></td>
  </tr>
</table>

## Features

- Compress JPEG and WebP images and optimize PNG without losing image data
- Convert between JPEG, PNG, and WebP
- Enhance images with adjustable controls and presets
- Resize images by dimensions, percentage, or long side
- Enlarge images by 1.5×, 2×, 3×, or 4× with Lanczos interpolation
- Edit images with crop, rotate, flip, patch tools, lasso selections, and temporary layers with soft and hard erasers
- Process batches with progress, cancellation, individual downloads, and ZIP export
- Use the interface in English or Russian, with light, dark, or system theme

## Tech stack

- React 19 and TypeScript
- Vite 7
- Tailwind CSS 4 and Radix UI
- Canvas 2D and Web Workers for selected CPU-intensive operations
- fflate for ZIP output and lossless PNG optimization

## Architecture

ImageMini is a Vite single-page application and PWA. Image processing runs on the user's device; images are not uploaded to a processing server. `src/pages/` contains operation screens, `src/components/` contains shared UI and editor workspaces, and `src/lib/` contains image processing, geometry, file output, localization, and worker code. Canvas 2D handles most transformations. Selected enhancement, resize, and patch operations use Web Workers. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for details.

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

## Testing

Run the project's checks with:

```powershell
npm run typecheck
npm test
npm run build
npm audit
```

## Limitations

- Patch results depend on the selected donor area; complex textures and lighting can leave visible seams.
- Large images and Lanczos upscaling can take several seconds and are bounded by browser canvas limits.
- AVIF, HEIC, and TIFF input depend on browser decoder support.
- Vite warns that the main JavaScript chunk exceeds its 500 kB warning threshold.
- The text tool is currently disabled.

## License

MIT. Copyright (c) 2026 Viktoria Penchuk. See [`LICENSE`](LICENSE). Third-party notices are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Author

[vika-penchuk-dev on GitHub](https://github.com/vika-penchuk-dev).



