# Third-party notices

The lockfile contains 290 npm package entries with license identifiers, and none are missing that metadata. Counts below are from `package-lock.json`; each package's own license file remains authoritative.

## License identifiers across the lockfile

- MIT: 251
- ISC: 18
- BSD-3-Clause: 2
- MPL-2.0: 12
- Apache-2.0: 4
- CC-BY-4.0: 1 (`caniuse-lite`)
- 0BSD: 1 (`tslib`)
- MIT AND ISC: 1

## Direct dependencies with non-MIT licenses

- Apache-2.0: `class-variance-authority`, `typescript`
- ISC: `lucide-react`

The other direct runtime and development dependencies declare MIT.

The repository does not vendor npm dependencies; `node_modules` is excluded from Git. Before distributing a bundled binary or repackaging dependencies, review each package's license text and attribution requirements. This file summarizes package metadata and is not a substitute for the full license texts.
