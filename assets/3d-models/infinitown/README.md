# Infinitown (Extracted)

Extracted and restored Three.js code from [Infinitown](https://demos.littleworkshop.fr/infinitown) by Little Workshop.

The original demo is **not open source**. This folder preserves the original minified bundle, splits out browserify modules, and provides a readable ES6 restoration validated against the live bundle.

## How the infinite city works

1. Export city prefabs (blocks, roads, intersections, cars, clouds) from Blender/Unity into `assets/scenes/main.json` + `assets/scenes/data/main.bin`.
2. At startup, randomly fill a **9×9** table of city blocks (`Table._generate`).
3. Render a **9×9** ring of visible chunk slots around the camera (`ChunksScene`).
4. When the view moves, **reuse** table entries with modulo wrap (`Table.getChunkData` + `SceneManager.refreshChunkScene`) to simulate an endless city.

See `extracted/city-and-blocks.js` for a short overview and module mapping. 

## Folder layout

| Path | Description |
|------|-------------|
| `index.html` | Vite entry — Three.js **r160** (`three@0.160.0`) |
| `package.json` | npm scripts: `dev`, `build`, `preview` |
| `src/index.js` | App entry (`InfinitownManager`) |
| `js/main.min.js` | Original browserify bundle (legacy reference) |
| `js/lib/three.min.js` | Bundled Three.js r71-era build from the demo |
| `legacy/` | Raw downloaded bundle + formatted copy |
| `extracted/modules/` | 91 browserify modules split from `main.min.js` |
| `extracted/city-and-blocks.js` | Restored summary of city/block generation |
| `src/module/` | Readable ES6 modules (restored from minified bundle) |
| `assets/scenes/` | Scene JSON + binary geometry from original server |
| `assets/main/` | Textures/material atlases for buildings & vehicles |
| `assets/environments/` | Image-based lighting probe data |
| `tools/` | Download / inspect / extract scripts |

## Run locally

Requires Node.js 18+.

```bash
cd DOCUMENTS/repos/infinitown
npm install
npm run dev
```

Open `http://localhost:4173/`.

Production build:

```bash
npm run build
npm run preview
```

Controls match the original: drag to pan, scroll to change camera height.

### Legacy bundle (original Three.js r71)

To compare against the untouched minified bundle, serve the folder and open `index-legacy.html` (uses `js/main.min.js` + `js/lib/three.min.js`).

## Extraction commands

```bash
node tools/_download_assets.cjs    # scene JSON + geometry bin + IBL
node tools/_download_runtime.cjs   # vignette/normal/white textures + css
node tools/_deobfuscate.cjs        # legacy/main.formatted.js
node tools/_extract.cjs            # extracted/modules/*
node tools/_inspect.cjs            # quick bundle stats
```

## Key source modules (restored)

- `src/module/config/GlobalConfig.js` — grid sizes, fog, shadow settings
- `src/module/model/Table.js` — random block/road/car placement on 9×9 table
- `src/module/scene/ChunksScene.js` — chunk slot grid (flat pick planes)
- `src/module/scene/SceneManager.js` — camera, lighting, chunk refresh/wrap
- `src/module/scene/LoadSceneManager.js` — Three.js ObjectLoader for exported scene
- `src/module/model/Car.js` — car motion + chunk boundary wrap

## Original minified mapping

| Readable module | Browserify module |
|-----------------|-------------------|
| `GlobalConfig` | `extracted/modules/module-050.js` |
| `Table` | `extracted/modules/module-048.js` |

## Credits

- Original experiment: [Little Workshop – Infinitown](https://demos.littleworkshop.fr/infinitown)
- 3D assets: VenCreations
- ES6 restoration cross-checked against the live bundle (also structurally aligned with community reverse-engineering work)

## License note

The original Infinitown assets and code remain property of Little Workshop. This extraction is for study/reference inside the EchoMesh documentation tree.
