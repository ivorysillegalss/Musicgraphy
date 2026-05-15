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
