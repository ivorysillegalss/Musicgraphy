# Espresso Amber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Espresso Amber vintage theme, ensure search is visually dominant, and keep map/shelf split entry for performance.

**Architecture:** Update global theme tokens and key UI components (navbar, search overlay, map, entry gate). Use a lightweight file-assertion smoke test to enforce palette and class usage without adding new test dependencies.

**Tech Stack:** Next.js (App Router), React, Tailwind v4, framer-motion, Node.

---

## File Structure
- Modify: src/app/globals.css (theme tokens, focus/selection, UI surfaces)
- Modify: src/app/layout.tsx (selection/focus adjustments if needed)
- Modify: src/components/ui/app-navbar.tsx (nav capsule styling)
- Modify: src/components/ui/search-overlay.tsx (search prominence and palette)
- Modify: src/components/ui/memoized-geographies.tsx (map fill/stroke)
- Modify: src/components/world-map.tsx (map background surface)
- Modify: src/app/page.tsx (entry gate styling + keep map/shelf split)
- Create: scripts/theme-smoke.test.mjs (palette + class usage assertions)

---

### Task 1: Add theme smoke test and update global palette

**Files:**
- Create: scripts/theme-smoke.test.mjs
- Modify: src/app/globals.css

- [ ] **Step 1: Write the failing test**

```js
// scripts/theme-smoke.test.mjs
import fs from "node:fs";
import assert from "node:assert/strict";

const globals = fs.readFileSync("src/app/globals.css", "utf8");

assert.match(globals, /--bg-ink:\s*#120f0c;/, "bg-ink missing");
assert.match(globals, /--bg-espresso:\s*#1b1511;/, "bg-espresso missing");
assert.match(globals, /--bg-roast:\s*#241b15;/, "bg-roast missing");
assert.match(globals, /--bg-elevated:\s*#2b2018;/, "bg-elevated missing");
assert.match(globals, /--text-cream:\s*#f3e8d9;/, "text-cream missing");
assert.match(globals, /--accent-amber:\s*#d39b5f;/, "accent-amber missing");
assert.match(globals, /--accent-brass:\s*#b77b3f;/, "accent-brass missing");
assert.match(globals, /--accent-ember:\s*#cc6b4a;/, "accent-ember missing");

console.log("theme-smoke: OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/theme-smoke.test.mjs`
Expected: FAIL with "bg-ink missing" (or another missing token)

- [ ] **Step 3: Write minimal implementation**

Update the root palette in src/app/globals.css (replace current :root block with this one):

```css
:root {
  /* Espresso Amber Palette */
  --bg-ink: #120f0c;
  --bg-espresso: #1b1511;
  --bg-roast: #241b15;
  --bg-elevated: #2b2018;

  --edge-soft: rgba(246, 229, 207, 0.08);
  --edge-bronze: rgba(194, 150, 97, 0.25);

  --text-cream: #f3e8d9;
  --text-muted: #c4b39a;
  --text-dim: #8d7c66;

  --accent-amber: #d39b5f;
  --accent-brass: #b77b3f;
  --accent-ember: #cc6b4a;

  --glow-amber: rgba(211, 155, 95, 0.18);
  --glow-ember: rgba(204, 107, 74, 0.18);

  /* Back-compat for existing tokens */
  --color-primary: #b77b3f;
  --color-secondary: #d39b5f;
  --color-cta: #d39b5f;
  --color-background: var(--bg-ink);
  --color-text: var(--text-cream);

  --bg-primary: var(--bg-ink);
  --bg-secondary: var(--bg-espresso);
  --bg-tertiary: var(--bg-roast);
  --bg-elevated: var(--bg-elevated);

  --border-subtle: var(--edge-soft);
  --border-default: var(--edge-soft);
  --border-accent: var(--edge-bronze);

  --text-primary: var(--text-cream);
  --text-secondary: var(--text-muted);
  --text-tertiary: var(--text-dim);
}
```

Also update selection + focus in globals.css:

```css
::selection {
  background: rgba(211, 155, 95, 0.24);
  color: #f3e8d9;
}

*:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(211, 155, 95, 0.4);
  border-radius: 2px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/theme-smoke.test.mjs`
Expected: PASS with "theme-smoke: OK"

- [ ] **Step 5: Commit**

```bash
git add scripts/theme-smoke.test.mjs src/app/globals.css
git commit -m "style: add espresso amber theme tokens"
```

---

### Task 2: Restyle navbar capsule to Espresso Amber

**Files:**
- Modify: src/components/ui/app-navbar.tsx
- Modify: scripts/theme-smoke.test.mjs

- [ ] **Step 1: Write the failing test**

```js
// append to scripts/theme-smoke.test.mjs
const navbar = fs.readFileSync("src/components/ui/app-navbar.tsx", "utf8");
assert.match(navbar, /bg-\[var\(--bg-espresso\)\]/, "navbar espresso bg missing");
assert.match(navbar, /border-\[var\(--edge-soft\)\]/, "navbar soft border missing");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/theme-smoke.test.mjs`
Expected: FAIL with "navbar espresso bg missing"

- [ ] **Step 3: Write minimal implementation**

Update the capsule wrapper className in src/components/ui/app-navbar.tsx:

```tsx
<div className="w-full max-w-6xl px-6 py-3 flex items-center justify-between bg-[var(--bg-espresso)]/90 backdrop-blur-xl border border-[var(--edge-soft)] rounded-2xl shadow-2xl shadow-black/60 pointer-events-auto">
```

Update muted text colors (replace hardcoded #9a948c and #5a5854) with palette tokens:

```tsx
<p className="text-[10px] text-[var(--text-dim)] font-medium tracking-[0.12em] uppercase mt-0.5">
```

```tsx
: "text-[var(--text-dim)] hover:text-[var(--text-cream)] border border-transparent"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/theme-smoke.test.mjs`
Expected: PASS with "theme-smoke: OK"

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/app-navbar.tsx scripts/theme-smoke.test.mjs
git commit -m "style: restyle navbar capsule to espresso amber"
```

---

### Task 3: Make search overlay dominant and on-palette

**Files:**
- Modify: src/components/ui/search-overlay.tsx
- Modify: scripts/theme-smoke.test.mjs

- [ ] **Step 1: Write the failing test**

```js
// append to scripts/theme-smoke.test.mjs
const search = fs.readFileSync("src/components/ui/search-overlay.tsx", "utf8");
assert.match(search, /bg-\[var\(--bg-roast\)\]/, "search input roast bg missing");
assert.match(search, /border-\[var\(--edge-bronze\)\]/, "search bronze border missing");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/theme-smoke.test.mjs`
Expected: FAIL with "search input roast bg missing"

- [ ] **Step 3: Write minimal implementation**

Update the search panel and input styles in src/components/ui/search-overlay.tsx:

```tsx
className="absolute left-1/2 top-20 z-40 w-full max-w-2xl -translate-x-1/2 flex flex-col gap-3 p-4"
```

```tsx
<div className="flex flex-col gap-2 rounded-xl border border-[var(--edge-soft)] bg-[var(--bg-espresso)]/95 p-3 shadow-2xl shadow-black/50">
```

```tsx
className="w-full bg-[var(--bg-roast)] px-2.5 py-2 text-sm text-[var(--text-cream)] outline-none placeholder:text-[var(--text-dim)] border border-[var(--edge-bronze)]/60 focus:border-[var(--accent-amber)]/60 transition-all rounded-lg"
```

```tsx
className="px-2.5 py-2 rounded-lg text-[11px] font-semibold bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-brass)] text-[#1a100a] shadow-lg shadow-[var(--glow-amber)]/50"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/theme-smoke.test.mjs`
Expected: PASS with "theme-smoke: OK"

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/search-overlay.tsx scripts/theme-smoke.test.mjs
git commit -m "style: emphasize search overlay with espresso amber"
```

---

### Task 4: Make map readable with amber strokes

**Files:**
- Modify: src/components/ui/memoized-geographies.tsx
- Modify: src/components/world-map.tsx
- Modify: scripts/theme-smoke.test.mjs

- [ ] **Step 1: Write the failing test**

```js
// append to scripts/theme-smoke.test.mjs
const geo = fs.readFileSync("src/components/ui/memoized-geographies.tsx", "utf8");
assert.match(geo, /stroke=\"var\(--edge-bronze\)\"/, "map stroke bronze missing");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/theme-smoke.test.mjs`
Expected: FAIL with "map stroke bronze missing"

- [ ] **Step 3: Write minimal implementation**

Update map fills/strokes in src/components/ui/memoized-geographies.tsx:

```tsx
fill="var(--bg-roast)"
stroke="var(--edge-bronze)"
strokeWidth={0.6}
className="transition-colors duration-500 hover:fill-[var(--bg-elevated)] focus:outline-none"
```

Update the map background rect in src/components/world-map.tsx to espresso ink:

```tsx
<rect x={0} y={0} width={SVG_WIDTH} height={SVG_HEIGHT} fill="var(--bg-ink)" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/theme-smoke.test.mjs`
Expected: PASS with "theme-smoke: OK"

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/memoized-geographies.tsx src/components/world-map.tsx scripts/theme-smoke.test.mjs
git commit -m "style: improve map readability in espresso amber"
```

---

### Task 5: Restyle entry gate to match Espresso Amber

**Files:**
- Modify: src/app/page.tsx
- Modify: scripts/theme-smoke.test.mjs

- [ ] **Step 1: Write the failing test**

```js
// append to scripts/theme-smoke.test.mjs
const page = fs.readFileSync("src/app/page.tsx", "utf8");
assert.match(page, /Enter Map View/, "entry gate map CTA missing");
assert.match(page, /Enter Shelf/, "entry gate shelf CTA missing");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/theme-smoke.test.mjs`
Expected: FAIL if CTAs are missing or renamed

- [ ] **Step 3: Write minimal implementation**

Update the entry gate container and buttons in src/app/page.tsx to espresso palette:

```tsx
className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-ink)]"
```

```tsx
className="h-16 w-16 mb-8 rounded-2xl bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-brass)] border border-[var(--edge-bronze)] flex items-center justify-center shadow-2xl shadow-[var(--glow-amber)]/50"
```

```tsx
className="px-8 py-4 rounded-xl bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-brass)] text-[#1a100a] font-semibold transition-all hover:translate-y-[-1px] active:translate-y-[0] shadow-lg shadow-[var(--glow-amber)]/50"
```

```tsx
className="px-8 py-4 rounded-xl border border-[var(--edge-soft)] bg-[var(--bg-espresso)]/80 text-[var(--text-cream)] font-semibold hover:bg-[var(--bg-roast)] transition-all"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/theme-smoke.test.mjs`
Expected: PASS with "theme-smoke: OK"

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx scripts/theme-smoke.test.mjs
git commit -m "style: espresso amber entry gate"
```

---

## Self-Review
- **Spec coverage:** Palette (Task 1), navbar/search (Tasks 2-3), map readability (Task 4), entry gate (Task 5), performance split preserved (Task 5).
- **Placeholder scan:** None.
- **Type consistency:** All references use existing component names and CSS variables.

---

Plan complete and saved to docs/superpowers/plans/2026-05-15-espresso-amber-implementation.md. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
