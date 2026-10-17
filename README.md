# Duncan R. Cordry (`DRC`) — Celestial & Epistemic Observatory

A 5-year-lifespan academic portfolio, generative celestial cartography observatory, bipartite scholarly workspace, and sovereign administrative control panel built in **Astro 5** with zero client UI framework dependencies.

## Core Architecture

1. **Stage 1 — Generative Constellation Engine (`/?sky=DRC-0001`..`DRC-1000`)**
   - 1,000-constellation sharded catalog (`public/data/sky/index.json` + `public/data/sky/shards/shard-00.json`..`shard-09.json`).
   - 1/4-resolution domain-warped fBm Milky Way & Great Rift dust lane offscreen buffer.
   - Planckian blackbody starlight (`OKLCH`), 3-zone Airy disk + halation, $9\text{px}$ "breathing halo" intaglio silverpoint lines, astrolabe reticles, Bayer Greek designations, and 4K Star-Chart PNG exporter.

2. **Stage 2 & 3 — Scroll-Linked Header Morph & Bipartite Academic Workspace**
   - Pure CSS Scroll-Driven Animations (`scroll(root block)` & `view-timeline`) morphing `"Duncan R. Cordry"` into `"DRC"` docked left.
   - Expanding telephone button (`commandfor="contact-id-card" command="show-modal"`, `closedby="any"`, CSS Anchor Positioning `anchor-name: --contact-btn`) morphing into Professor Cordry's Faculty ID Card.
   - 2-state day/night toggle (`<meta name="color-scheme">` + CSS `light-dark()`).
   - Bipartite desktop workspace (`>= 768px`) and mobile horizontal CSS scroll-snap drill-down (`< 768px`) across **PUBLICATIONS**, **BOOKS**, and **CLASSES**.

3. **Printable LaTeX-Grade CV (`/cv`) & Standalone Paper Routes (`/publications/[slug]`)**
   - Highwire Press `citation_*` meta tags for automatic Google Scholar indexing.

4. **Sovereign Control Panel (`/admin` & `/api/admin/*`)**
   - Protected by `node:crypto` (`scryptSync` + `HMAC-SHA256` session & CSRF tokens).
   - One-Paste Crossref DOI metadata importer, Classes/Publications CRUD, client `<canvas>` 4:5 portrait cropper, Constellation Inspector/deleter, and 3-tier System Lifecycle switchboard (HTTP 503 Maintenance Shutter, Node `SIGTERM` shutdown, and guarded `DESTROY-DRC-OBSERVATORY` archive purge).

## Commands

```bash
# Regenerate the 1,000-constellation catalog shards
npm run generate:sky

# Start development server
npm run dev

# Build production bundle
npm run build

# Run standalone production server
npm run preview
```

See [ARCHITECTURAL_BLUEPRINT.md](./ARCHITECTURAL_BLUEPRINT.md) for the complete technical specification.
