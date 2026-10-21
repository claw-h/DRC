# DRC Public Site: Mobile Port Blueprint

> **Purpose:** A build-ready architectural guide for porting the public-facing Duncan R. Cordry portfolio and observatory to a mobile-first product. This document separates the system that exists today from the proposed mobile experience. It treats the administration UI as an internal design reference only.

## 1. Product scope and decisions

The public product is an academic portfolio with three entry points: the observatory landing page, the scholarly workspace (publications, books, classes), and standalone publication/CV pages. The mobile port should preserve the academic content, celestial identity, permanent URLs, citations, and access to contact/profile information. It should make reading and navigation primary on small screens. Across both public and admin mobile interfaces, remove hover-dependent interactions: no content, navigation, or action may require hover to discover or operate it.

The existing web application is the content and route source of truth. A mobile port should consume a stable public content API or generated versioned JSON snapshot; it should not embed admin credentials, access admin endpoints, or depend on the admin UI. The native/mobile shell should have an explicit capability boundary from `/admin/*` and `/api/admin/*`.

**Product decision: build this as a Progressive Web App (PWA) with a native-quality web interface.** The mobile experience remains a web product that can be installed from a supporting browser and launched standalone. It should feel app-like through fast transitions, persistent navigation, safe-area-aware layouts, touch-first controls, and resilient offline states, while retaining web URLs, browser navigation, and sharing. Do not plan a native app wrapper as part of this port. Do not port the admin console as a public app feature.

## 2. Current system (verified in repository)

### Runtime and deployment

- Astro 5 with `@astrojs/vercel`, configured for the `bom1` Vercel region (`astro.config.mjs`, `vercel.json`). It is not currently an Astro Node standalone deployment.
- Public pages are server-rendered (`prerender = false` on `/`, `/cv`, and `/publications/[slug]`) and set short shared-cache headers with stale-while-revalidate. The README and older blueprint statements about pre-rendered routes should not be used as implementation facts.
- Astro islands are implemented as native custom elements and browser scripts, without React/Vue/Svelte hydration (`<drc-workspace>`, `<drc-constellation-canvas>`, theme/accessibility controls).
- `src/middleware.ts` protects admin routes and API calls, bypasses selected public assets, and applies public maintenance rewriting using `getSystemState()`.

### Public route and component map

| Route | Current responsibility | Mobile-port role |
| --- | --- | --- |
| `/` | Observatory canvas, intro/profile transition, academic workspace | Main mobile landing and discovery flow |
| `/publications/[slug]` | Standalone paper with citation metadata, abstract, sections, BibTeX | Canonical, shareable reading route; preserve deep links |
| `/cv` | Profile-derived academic CV and print action | Responsive CV and native share/print handoff |
| `/offline`, `/offline/mobile` | Maintenance/network fallback pages | Offline and maintenance states |
| `/api/status` | Public system status | Optional status signal; never expose admin state |
| `/admin/*` | Authenticated editorial and operations console | Out of public mobile-port scope; inspiration only |

`BaseLayout.astro` owns global metadata, theme and accessibility preference bootstrap, service worker registration, and connectivity redirects. `PersistentHeader.astro`, `NavStrip.astro`, and `AcademicWorkspace.astro` provide shared public chrome and browsing controls. `ConstellationStage.astro` contains the canvas custom element and most sky interaction logic. `PublicationsWorkspace.astro`, `BooksWorkspace.astro`, and `ClassesWorkspace.astro` render the three collections and their detail readers/modals.

### Content and persistence

- Schemas live in `src/content.config.ts`: publications, books, and classes are Markdown-backed collections with Zod-validated frontmatter.
- `src/data/profile.json` holds the local faculty fallback; `src/data/system-state.json` holds the local system state fallback.
- `src/lib/turso.ts` attempts Turso/libSQL and falls back to local Markdown/JSON content when the database is unavailable or not configured. It also maintains an in-memory workspace cache with a 30-second TTL and explicit invalidation.
- The sky catalog is static JSON under `public/data/sky/` with an index, constellation manifest, stars dataset and ten shards. `scripts/generate-constellations.mjs` generates the catalog; `scripts/verify-sky-data.mjs` validates it.
- Public routes currently call the server-side loader and send collection data in page output. A dedicated public API is not presently defined; adding one is a port prerequisite if a native client is planned.

### Interaction and network model

- The home page has three vertical stages: canvas/sky, profile transition, academic workspace. `src/pages/index.astro` synchronizes stage state and applies wheel and touch thresholds for stages one and two. The workspace owns collection switching, readers, search/filter controls, details dialogs, copy actions, and mobile stack state.
- At widths below 768px, the workspace CSS changes the split-pane layout to a horizontal index/detail snap pattern. The existing workspace script synchronizes snap state, inertness, back controls and browser history. This is a responsive web pattern, not a dedicated native navigation implementation.
- The public header and academic workspace have additional keyboard controls and reduced-motion branches. Preserve those behaviors or provide equivalent accessible native controls.
- `public/sw.js` caches offline screens and applies network-first navigation plus stale-while-revalidate behavior to selected assets. It does not currently provide a complete offline content database.

## 3. Admin mobile design references

The admin shell in `src/layouts/AdminLayout.astro` is a useful reference for mobile navigation and information hierarchy, but its workflows and privileged data must remain separate from the public app.

- **Stable module navigation:** Desktop sidebar becomes a four-item fixed bottom tab bar on mobile, with a current-module indicator. For the public port, adapt this to a small number of visitor-facing destinations such as Home, Work, Teaching, and Profile; keep the labels explicit and URLs meaningful.
- **Utility overflow sheet:** The admin hides secondary desktop header actions behind a compact disclosure menu. Public utilities (theme, accessibility, contact/share) can use the same pattern, but primary content destinations must remain visible.
- **Contextual identity and active destination:** The admin header displays a compact identity lockup and current module dropdown. The public app can retain the DRC identity and current section, while avoiding an admin-style control dashboard aesthetic.
- **Navigation feedback:** The admin provides touch feedback and a page-navigation progress indicator. Use restrained feedback for public transitions, but avoid blocking navigation or simulating a long load for cached content.
- **No hover dependency on mobile:** The admin sidebar has hover-to-expand behavior on larger screens, and some public sky/cartouche and navigation treatments expose detail through hover. On mobile, replace these with always-visible labels or explicit tap controls/disclosures. Touching a control should activate it predictably; it must not rely on a synthetic hover state or require a second tap to perform the action.
- **Persistent settings:** Admin theme/accessibility settings are stored separately from public settings. Preserve namespace isolation (`drc-admin-*` versus public preferences) in any shared client bundle.
- **Do not reuse:** Admin module routes, session countdown/status controls, destructive lifecycle operations, catalog editing, upload tools, CSRF/session data, and editorial action menus are not public-port features.

The strongest transferable lesson is the admin shell's explicit mobile information architecture: primary destinations are continuously reachable, secondary actions are grouped, and the active location is visible. The public site should use this with less control-room density and more reading space.

## 4. Proposed mobile information architecture

### Navigation model

Use a single, persistent bottom navigation bar for the top-level public sections. Suggested destinations:

1. **Explore** — observatory and introductory profile.
2. **Publications** — searchable publication list and readers.
3. **Books** — book list and dossiers.
4. **Teaching** — classes, syllabi and course details.

Profile/CV/contact actions belong in the Explore profile area or a compact utility sheet, rather than adding a fifth dense tab. Each destination must remain deep-linkable. Opening a record pushes a route or a URL state; system back returns to its collection and restores list scroll/filter state. A direct record link opens a complete page with a clear in-app back destination.

### Constellation controls and mobile detail presentation

Unify the constellation canvas and its actions as one chart workspace with a consistent control hierarchy, rather than separate hoverable floating controls. On mobile, the chart supports exactly two direct-manipulation behaviors: **pan** and **pinch to zoom**. Do not support tapping stars, selecting a constellation, opening a detail panel, or showing star/constellation metadata from chart interaction. Remove mobile loupe and star-inspection affordances. Keep non-inspection page navigation (for example, leaving the sky for the academic archive) separate from chart gestures and expose it as an explicit visible control.

The astronomical loupe is a desktop pointer tool and is **disabled on mobile**: do not show an active loupe control or attach loupe behavior to touch. Pinch zoom is the chart's normal navigation. Keep the existing loupe and its behavior unchanged on desktop.

On mobile only, remove the floating Publications/Books/Classes detail dialogs (publication codex, book tome, and class ledger) from the interaction flow. Selecting an item should open its inline/full-screen reader or dedicated detail route in the mobile navigation stack, with a visible back action and preserved list context. Keep those existing floating dialogs and their desktop behavior untouched at desktop widths. This is a responsive behavior split, not a desktop redesign.

### Screen inventory

| Screen | Content and key actions | Mobile behavior |
| --- | --- | --- |
| Explore | Compact sky illustration/canvas, name, role, short bio, focus areas, key links | Skip first-visit forced introduction; one clear “Browse work” action |
| Sky chart | Generative constellation chart | Aspect-preserving, pannable and pinch-zoomable; no star/constellation tap interactions or detail UI; static fallback and reduced-motion mode |
| Collection | Search, year/topic filters, sorted cards/list, result count | Native vertical scroll; preserve query and scroll position |
| Record detail | Publication/book/course content, metadata, abstract/synopsis, citations/readings | Full route or full-screen detail view with explicit back button |
| Paper permalink | Complete scholarly article with citation metadata and BibTeX | Text-first responsive article; preserve canonical URL and browser behavior |
| CV | Profile, appointments, works, education, contact | Readable screen layout plus print/share actions |
| Offline | Cached shell, last sync/status, retry | Cached public profile and previously saved records where supported |

### Reading interactions

- Prefer ordinary vertical page scrolling to nested scroll areas. The current workspace uses a fixed-height shell with internal reader scrolling; for mobile, the port should make each detail reader a normal page or a single full-height route with a visible back action.
- Use compact collection cards with title, year, venue/publisher/course code, and one primary action. Keep full abstracts, chapters, syllabi, and bibliographic material in the detail view.
- Put citation actions in the paper detail action row: copy formatted citation, copy BibTeX, DOI, PDF if present, and share. Provide visible success feedback and a fallback if clipboard APIs are unavailable.
- Use native disclosure/accordion patterns for long course weeks, endorsements, references, or book chapters when useful. Keep headings and deep links accessible.
- Replace the Publications/Books/Classes floating detail dialogs with in-flow mobile details only on mobile. The desktop dialog implementation and triggers remain as they are; use the mobile breakpoint to choose the detail presentation, and ensure selection/back/history behavior remains coherent when the viewport crosses breakpoints.
- Avoid horizontal swipe as the only way to change category or return. Provide visible buttons, and let OS back gestures work naturally.

## 5. Mobile PWA architecture

### Client and server boundary

```mermaid
flowchart LR
  UI[Mobile public UI] -->|HTTPS GET| PublicAPI[Public read API / versioned JSON]
  PublicAPI --> Loader[Shared content loader]
  Loader --> DB[(Turso / libSQL)]
  Loader --> MD[Markdown + JSON fallback]
  UI --> Cache[Service worker or native cache]
  Admin[Admin console] -->|authenticated writes| AdminAPI[/api/admin/*]
  AdminAPI --> DB
  AdminAPI --> MD
```

The mobile client must call only public read interfaces. Add a versioned read contract, for example `/api/public/v1/bootstrap`, `/api/public/v1/publications`, `/api/public/v1/books`, `/api/public/v1/classes`, and individual record routes. The exact endpoint set can be consolidated, but responses should be explicit, stable, and independent from Astro's internal collection object shape.

Suggested response envelope:

```json
{
  "schemaVersion": 1,
  "generatedAt": "ISO-8601",
  "profile": {},
  "collections": {
    "publications": [],
    "books": [],
    "classes": []
  },
  "links": {}
}
```

Use ETags or content hashes for conditional requests. Responses should include canonical IDs and URLs, normalized ISO dates/years, image dimensions/alt text, optional external links, and all reader content required for offline detail display. Return public content only; never serialize admin/session fields or database credentials.

### Shared modules

- `content-contract`: public response types, schema version and validation.
- `public-content`: server loader shared by Astro pages and API handlers; unify Turso/local fallback semantics.
- `mobile-navigation`: route mapping, selected collection, back restoration and deep-link rules.
- `preferences`: public theme, text size/accessibility and saved items with versioned storage keys.
- `offline-cache`: shell precache, public API cache policy, storage budget and cache eviction.
- `analytics`: optional, privacy-minimal route/action events; never block rendering.

Implement these as small browser modules/custom elements and PWA service-worker functions. Keep the public content contract versioned even though the first client is web-based, so content delivery remains decoupled from Astro templates.

### Data and caching contract

- **Bootstrap:** profile, counts, collection summaries, global public links, catalog version.
- **Collection list:** pagination or bounded list, sort order and filter metadata. Current content volumes are small, but avoid requiring a full all-content download as they grow.
- **Detail:** complete record body and metadata, including article sections/references/BibTeX, book chapters/endorsements/purchase links, and class weeks/reviews/syllabus URL.
- **Cache:** cache shell/assets aggressively by hashed URL; cache public content with ETag revalidation and a documented stale policy; never cache authenticated admin/API responses in the public cache.
- **Invalidation:** content writes should update the same source used by public API and route loaders and return a new collection/version ETag. Existing cache TTL alone is insufficient as a native synchronization contract.
- **Offline:** provide the profile, CV shell, and previously visited/saved detail records. Show when data is stale and offer retry. Do not imply the entire archive is available offline unless it has been downloaded.

## 6. Visual and interaction system

- Preserve the visual signature: engraved astronomical sky, serif editorial titles, restrained mono metadata, light/dark themes, and warm accent rules. Reduce ornament density on record lists so titles remain scannable.
- Use safe-area aware padding (`env(safe-area-inset-*)`), dynamic viewport units, and keyboard-aware form layouts. Bottom navigation must account for the home indicator.
- Target at least 44×44 CSS-pixel touch areas for primary controls; keep text controls and list rows spacious. Avoid hover-only affordances and mouse-specific loupe behavior on touch.
- Remove hover-only interactions from both public and admin mobile experiences. Any control or detail currently revealed by `:hover`, pointer hover listeners, or hover expansion must be available through a visible button, tap disclosure, or persistent mobile layout. Do not emulate hover on touch or make the first tap merely reveal a control that then needs a second tap to work.
- Make text size comfortable at 360px viewport width; body content should not require pinch zoom. Long code/citation blocks may scroll horizontally within their own labelled region.
- Respect `prefers-reduced-motion`, keyboard focus, VoiceOver/TalkBack semantics, high contrast preference, and public accessibility mode. Canvas must have a text fallback and a usable non-canvas route.
- The landing sky is a detailed chart, not a background to stretch or crop to fill a portrait screen. Preserve coordinate geometry and aspect ratio at every zoom level; fit the initial view inside the available viewport and leave unused space letterboxed when needed. Never rotate or non-uniformly scale the plotted sky just to fill the phone.
- Support only direct manipulation for chart navigation: one-finger pan and two-finger pinch zoom. Do not bind taps on stars or chart regions to selection, metadata, dialogs, or navigation. Do not add zoom buttons or a reset control unless separately requested; the mobile chart interaction model is gesture-only.
- Render a static, proportionally scaled chart immediately, load chart data after first paint, and suspend animation when hidden or when reduced motion/data saving applies. Reduced motion disables decorative animation, not pan or pinch zoom.
- Avoid hijacking vertical touch gestures for stage snapping on phones. The existing stage transition is a visual layer, not the content navigation model for the mobile port.
- Hide/disable the astronomical loupe on mobile; pan and pinch zoom are the only mobile chart navigation methods. Preserve the desktop loupe unchanged.

## 7. Security and privacy boundaries

- Public client contains only public content and public read credentials, if any; never embed `TURSO_AUTH_TOKEN`, admin secrets, session tokens, or CSRF values.
- Keep admin writes behind existing server-side session/CSRF validation. The mobile public client has no path to write content.
- Keep same-origin API access for the PWA; configure CORS only if a separately authorized public web origin is introduced.
- Validate external links and use safe browser handoff for PDFs, DOI, purchasing, and faculty profiles.
- Public preference storage can contain theme, text scale, saved record IDs, and last visited routes. Avoid collecting sensitive data or adding tracking without a product need.

## 8. Delivery plan

### Phase 0 — Verify and contract

1. Freeze a public content DTO from the existing Zod collection schemas and profile model.
2. Extract a shared server loader from `src/lib/turso.ts` behind a public read API.
3. Add contract fixtures for all three collection types and fallback behavior.
4. Treat PWA as the selected distribution model and keep the public content API versioned for future maintenance.

### Phase 1 — Mobile web foundation

1. Create a mobile public shell with compact identity, bottom navigation, theme/accessibility utilities, safe-area handling, and route-aware back behavior.
2. Rework `/` into a mobile Explore page with optional sky canvas and a clear path to profile/work.
3. Make collections and record details normal-flow mobile pages; preserve search/filter state, list scroll, and existing canonical links.
4. Replace public academic detail dialogs with mobile in-flow readers/routes while retaining the desktop dialogs and triggers at desktop widths.
5. Rework `/cv` and standalone paper routes for narrow widths and share/print affordances.

### Phase 2 — Offline and sky enhancement

1. Add versioned public content caching, saved records, retry/stale states, and cache budget policy.
2. Tune sky data loading and canvas lifecycle for mobile memory, battery, data saver, visibility and reduced motion. Preserve projection and coordinate detail through zoom; use level-of-detail rendering or viewport culling if drawing every star becomes expensive.
3. Keep a static fallback for unsupported canvas/performance constraints. The fallback retains the chart's aspect ratio and should not imply zoomable inspection unless that behavior is implemented.

### Phase 3 — PWA installation and polish

1. Add and validate the web app manifest, icons, install presentation, standalone display mode, and update lifecycle.
2. Verify installed and browser modes, safe-area behavior, browser back/deep links, share targets, and offline fallback on supported mobile browsers.
3. Tune startup, transitions, content caching, and installation/update prompts so the web app feels native in use without obscuring its web URLs and browser controls.

## 9. Acceptance criteria

- Every public desktop destination and publication permalink is reachable on a narrow phone viewport without horizontal page overflow.
- The sky retains its coordinate geometry and aspect ratio on portrait screens; users can pan and pinch-zoom without distortion.
- Tapping stars or chart regions never selects features, opens detail UI, or navigates; the mobile chart supports pan and pinch zoom only.
- Neither public nor admin mobile navigation/content/actions depend on hover; touch controls activate in one intentional step, and previously hover-revealed information has an explicit tap or persistent-display equivalent.
- Mobile chart interactions are limited to pan and pinch zoom; no star inspection or detail presentation is exposed. The loupe is unavailable on mobile and remains unchanged on desktop.
- On mobile, selecting a publication, book, or class opens an in-flow reader/detail view instead of a floating modal; desktop floating dialogs remain untouched.
- A visitor can navigate Explore → collection → detail → back and retain collection/filter/scroll context; direct links have a valid return path.
- Keyboard, VoiceOver/TalkBack, reduced-motion and high-contrast paths remain usable; the sky is not required to access academic content.
- Theme and accessibility settings persist in public storage and remain isolated from admin preferences.
- Public content loads from the API with the same Turso/local fallback as Astro pages; API failures show stale cached content or a clear retry state.
- Offline UI distinguishes maintenance mode from connectivity loss and does not claim uncached data is available.
- Admin routes and write endpoints remain excluded from the public bundle, navigation, cache and mobile API contract.
- Existing canonical publication URLs, citation metadata, DOI links, PDF links, and CV print output continue to work.

## 10. Known constraints and verification notes

- `src/pages/index.astro` and other public route files currently use `export const prerender = false`; deployment behavior is server-rendered on Vercel.
- The README's “Astro Node standalone” and some of the older `ARCHITECTURAL_BLUEPRINT.md` component tree/schema claims are aspirational or stale. For implementation, prefer the source tree and this verified current-state section.
- The active service worker is a useful fallback but does not yet define a complete offline-first content strategy.
- The mobile CSS breakpoint is 767px in the workspace. The admin layout has separate breakpoints around 1024px and 768px and a bottom tab bar; these breakpoints should not be treated as public UI requirements.
- PWA is the selected distribution model. Native-grade interface quality is a design and performance goal for the web app, not a commitment to a native wrapper.
