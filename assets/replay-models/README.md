# Replay release models

This directory is the self-contained model bundle used by the replay viewer.
It contains 255 catalog or scene models and 284 files including required texture and glTF sidecars.

- Runtime base URL: `/assets/replay-models/`
- Generated manifest: `manifest.json`
- Source authoring packs under `assets/3d-models/` are not required for build or release.

Regenerate this directory only while the generated public assets are available:

```sh
npm run replay:assets:prepare
```
