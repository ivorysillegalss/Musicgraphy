# Mobile Adaptation Implementation Plan

Date: 2026-06-03

# Mobile Adaptation Implementation Plan

> I'm using the writing-plans skill to create the implementation plan.

Goal: Implement the Focused Map-First mobile adaptation (Approach 2). Prioritize phones and small tablets (≤ 820px), map touch/gesture quality, responsive UI patterns (compact navbar, bottom sheet controls), and rendering performance optimizations.

Architecture: Keep existing component boundaries. Introduce mobile-specific UI variants (compact navbar, bottom sheet) and feature-flag-controlled runtime toggles. Add small utility modules for touch-optimized event handling and RAF batching.

Tech Stack: Next.js (App Router), React, TypeScript, Tailwind/CSS, d3-geo / topojson for maps, framer-motion for micro-interactions.

---

### Task 1: Add mobile CSS tokens and base responsive rules

Files:
- Modify: `src/app/globals.css`

- [ ] Step 1: Add mobile tokens and safe-area rules to `globals.css` (insert near root variables)

Copy this CSS block and place near top of `src/app/globals.css` inside `:root` or after existing tokens.

```css
/* Mobile tokens */
@media (max-width: 820px) {
  :root {
    --nav-height: 56px;
    --nav-height-compact: 44px;
    --touch-target: 44px;
    --control-card-height: 88px;
    --timeline-track-height: 14px;
    --marker-size-mobile: 28px;
    --marker-image-size-mobile: 36px;
  }
  html, body { height: 100%; }
  body { font-size: 16px; }
  .app-safe-area { padding-bottom: env(safe-area-inset-bottom); }
}

/* Hide complex entry animations on prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
}
```

- [ ] Step 2: Commit

```bash
git add src/app/globals.css
git commit -m "chore: add mobile CSS tokens and safe-area helpers"
```

---

### Task 2: `AppNavbar` — compact variant with overflow menu

Files:
- Modify: `src/components/ui/app-navbar.tsx`

- [ ] Step 1: Add compact layout styles and an overflow menu button visible on mobile.

Minimal patch example (insert conditional className and menu button):

```tsx
// inside AppNavbar render
<div className="w-full max-w-6xl mx-auto px-4 py-2 md:py-3 relative flex items-center justify-between">
  <div className="flex items-center gap-3">
    {/* logo */}
  </div>

  {/* mobile overflow */}
  <div className="md:hidden flex items-center gap-2">
    <button aria-label="Open menu" className="p-2 rounded-md" onClick={() => setIsMobileMenuOpen(true)}>
      <svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    </button>
  </div>

  {/* desktop controls remain in md:block */}
</div>

// Add mobile menu panel component or reuse existing modal to show overflow actions.
```

- [ ] Step 2: Commit

```bash
git add src/components/ui/app-navbar.tsx
git commit -m "feat(nav): add compact navbar variant and mobile overflow menu"
```

---

### Task 3: `WorldMap` — touch handling, passive listeners, and mobile collision tuning

Files:
- Modify: `src/components/world-map.tsx`

- [ ] Step 1: Detect mobile at runtime and expose `isMobile` boolean (based on viewport width or user-agent fallback). Add lightweight util `src/lib/is-mobile.ts`.

Create `src/lib/is-mobile.ts`:

```ts
export function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 820;
}

export default isMobileViewport;
```

- [ ] Step 2: Use passive touch listeners and pointer events in `WorldMap` mounting code.

Example change:

```ts
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  function onTouchStart(e: TouchEvent) { /* ... */ }
  el.addEventListener('touchstart', onTouchStart, { passive: true });

  return () => {
    el.removeEventListener('touchstart', onTouchStart);
  };
}, []);
```

- [ ] Step 3: Condition collision tuning for mobile (reduce iterations and max displacement)

Snippet to adjust tuning inside map code:

```ts
const isMobile = isMobileViewport();
const collisionProfile = getCollisionProfile(zoom, density, totalMarkers);
if (isMobile) {
  collisionProfile.iterations = Math.max(8, Math.round(collisionProfile.iterations * 0.6));
  collisionProfile.clusterIterations = Math.max(4, Math.round(collisionProfile.clusterIterations * 0.6));
  collisionProfile.maxDisplacementPx = Math.min(collisionProfile.maxDisplacementPx, 22);
}
```

- [ ] Step 4: Commit

```bash
git add src/components/world-map.tsx src/lib/is-mobile.ts
git commit -m "feat(map): add mobile touch handlers and lower collision budget for mobile"
```

---

### Task 4: `BottomControls` → draggable bottom sheet variant

Files:
- Modify: `src/components/ui/bottom-controls.tsx`
- Create: `src/components/ui/bottom-sheet.tsx` (reusable)

- [ ] Step 1: Create `bottom-sheet.tsx` minimal sheet component using transform and pointer events.

Example minimal `bottom-sheet` component (TSX):

```tsx
import React, { useRef } from 'react';

export function BottomSheet({ children, open, onClose }: any) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={ref} className="absolute left-0 right-0 bottom-0 bg-[var(--bg-elevated)] rounded-t-lg p-4 transform-gpu transition-transform duration-200">
        {children}
      </div>
    </div>
  );
}
```

- [ ] Step 2: Replace `BottomControls` on mobile to render as a `BottomSheet` with timeline, layer toggles, and a large visible drag-handle.

- [ ] Step 3: Commit

```bash
git add src/components/ui/bottom-controls.tsx src/components/ui/bottom-sheet.tsx
git commit -m "feat(ui): add bottom sheet and mobile bottom controls"
```

---

### Task 5: Album popover → mobile bottom sheet (map-marker)

Files:
- Modify: `src/components/ui/map-marker/album-marker.tsx`

- [ ] Step 1: On mobile, open `BottomSheet` with album details instead of floating tooltip.

Small code sample:

```tsx
const handleOpen = () => {
  if (isMobileViewport()) {
    openBottomSheet({ album });
  } else {
    setPopoverOpen(true);
  }
};
```

- [ ] Step 2: Commit

```bash
git add src/components/ui/map-marker/album-marker.tsx
git commit -m "feat(map): open album details as bottom sheet on mobile"
```

---

### Task 6: LibraryDrawer & Modals — full-screen / bottom-sheet fallback

Files:
- Modify: `src/components/ui/library-drawer.tsx` and any modal components under `src/components/ui/*`.

- [ ] Steps:
  - Make `LibraryDrawer` render as right-side drawer on desktop (`md:`) and full-screen or bottom-sheet on mobile.
  - Ensure keyboard dismiss (`Esc`) and swipe-down gesture close on mobile.

Commit after changes.

---

### Task 7: Feature flag and runtime toggle

Files:
- Create: `src/lib/feature-flags.ts`

- [ ] Step 1: Add small runtime feature-flag util to gate mobile behavior.

`src/lib/feature-flags.ts`:

```ts
export const FLAGS = {
  MOBILE_MAP_V2: typeof window !== 'undefined' ? Boolean(window.__PMGT_FLAGS?.MOBILE_MAP_V2) : false,
};

export function isEnabled(flag: keyof typeof FLAGS) {
  return FLAGS[flag];
}
```

- [ ] Step 2: During rollout, set `window.__PMGT_FLAGS = { MOBILE_MAP_V2: true }` in the browser console or via environment-based injection.

---

### Task 8: Performance utilities (RAF batching + culling)

Files:
- Create: `src/lib/raf-batcher.ts`
- Modify: `src/components/world-map.tsx` to use it for marker position updates

- [ ] Step 1: Add small RAF batching utility

`src/lib/raf-batcher.ts`:

```ts
type Fn = () => void;
let queued = new Set<Fn>();
let scheduled = false;
function flush() {
  scheduled = false;
  const copy = Array.from(queued);
  queued.clear();
  for (const fn of copy) fn();
}
export function schedule(fn: Fn) {
  queued.add(fn);
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}
```

- [ ] Step 2: Use `schedule()` to batch DOM/CSS transform updates for markers.

Commit after adding util and integrating small usage.

---

### Task 9: Testing and verification

- [ ] Step 1: Run local dev server and verify basic mobile UI ./ manual checklist

```bash
# start dev server
npm install
npm run dev

# open in Chrome, toggle device toolbar or test on real device proxy
```

- [ ] Manual test checklist:
  - Map drag & pinch feels responsive on iPhone/Android.
  - Markers don't drift into ocean visually.
  - Bottom sheet opens and closes with swipe down and Esc.
  - Navbar overflow menu shows necessary actions.
  - Timeline slider is usable with thumb size ≥ 44px.

- [ ] Step 2: Lighthouse mobile run (basic perf smoke)

```bash
# from chromium build or using lighthouse cli
npx lighthouse http://localhost:3000 --only-categories=performance --emulated-form-factor=mobile
```

---

### Task 10: Rollout and PR

- [ ] Step 1: Create a branch `feat/mobile-map-v2` and push commits frequently per task.

```bash
git checkout -b feat/mobile-map-v2
# implement tasks & commit
git push -u origin feat/mobile-map-v2
```

- [ ] Step 2: Open PR with description, screenshots (mobile, desktop) and test notes. Add reviewers.

---

### Self-review checklist

- Ensure every modified file path listed above exists and the edits are minimal and reversible.
- No placeholders left in production code; mobile behavior gated by feature flag initially.

---

If you want, I can now: (A) start implementing Task 1–3 inline (apply code changes and run quick validation), or (B) dispatch implementation subagents per task. Which do you prefer? Reply with "implement" or "subagents".