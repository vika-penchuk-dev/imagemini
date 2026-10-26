# Third-party notices

The lockfile contains 310 npm package entries with license identifiers, and none are missing that metadata. Counts below are from `package-lock.json`; each package's own license file remains authoritative.

## License identifiers across the lockfile

- MIT: 258
- ISC: 19
- BSD-3-Clause: 12
- MPL-2.0: 12
- Apache-2.0: 6
- CC-BY-4.0: 1 (`caniuse-lite`)
- 0BSD: 1 (`tslib`)
- MIT AND ISC: 1 (`victory-vendor`)

## Direct dependencies with non-MIT licenses

- Apache-2.0: `class-variance-authority`, `typescript`
- ISC: `lucide-react`

The other direct runtime and development dependencies declare MIT. The BiRefNet Lite 512 model weights and ONNX Runtime Web are MIT licensed. Their full notices, including required copyright text, are preserved in [`public/licenses/`](public/licenses/). The BiRefNet license at the pinned model revision is also available [on Hugging Face](https://huggingface.co/studioludens/birefnet-lite-512/blob/962e67969ec6acec9c19fab76acee4f5e22e990c/LICENSE).

The repository does not vendor npm dependencies; `node_modules` is excluded from Git. Before distributing a bundled binary or repackaging dependencies, review each package's license text and attribution requirements. This file summarizes package metadata and is not a substitute for the full license texts.
