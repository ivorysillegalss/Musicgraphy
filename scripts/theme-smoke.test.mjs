import fs from "node:fs";
import assert from "node:assert/strict";

const globals = fs.readFileSync("src/app/globals.css", "utf8");

assert.match(globals, /--bg-ink:\s*#120f0c;/, "bg-ink missing");
assert.match(globals, /--bg-espresso:\s*#1b1511;/, "bg-espresso missing");
assert.match(globals, /--bg-roast:\s*#241b15;/, "bg-roast missing");
assert.match(globals, /--bg-elevated:\s*#2b2018;/, "bg-elevated missing");
assert.match(globals, /--edge-soft:\s*rgba\(246, 229, 207, 0\.08\);/, "edge-soft missing");
assert.match(globals, /--edge-bronze:\s*rgba\(194, 150, 97, 0\.25\);/, "edge-bronze missing");
assert.match(globals, /--text-cream:\s*#f3e8d9;/, "text-cream missing");
assert.match(globals, /--text-muted:\s*#c4b39a;/, "text-muted missing");
assert.match(globals, /--text-dim:\s*#8d7c66;/, "text-dim missing");
assert.match(globals, /--accent-amber:\s*#d39b5f;/, "accent-amber missing");
assert.match(globals, /--accent-brass:\s*#b77b3f;/, "accent-brass missing");
assert.match(globals, /--accent-ember:\s*#cc6b4a;/, "accent-ember missing");
assert.match(globals, /--glow-amber:\s*rgba\(211, 155, 95, 0\.18\);/, "glow-amber missing");
assert.match(globals, /--glow-ember:\s*rgba\(204, 107, 74, 0\.18\);/, "glow-ember missing");

const navbar = fs.readFileSync("src/components/ui/app-navbar.tsx", "utf8");
assert.match(navbar, /bg-\[var\(--bg-espresso\)\]/, "navbar espresso bg missing");
assert.match(navbar, /border-\[var\(--edge-soft\)\]/, "navbar soft border missing");

console.log("theme-smoke: OK");
