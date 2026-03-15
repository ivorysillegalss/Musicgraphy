#!/usr/bin/env node

const baseUrl = (process.env.DREAM_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const limit = Number.parseInt(process.env.BACKFILL_COVER_LIMIT || "300", 10);
const forceRefresh = process.env.BACKFILL_COVER_FORCE_REFRESH === "1";
const userId = process.env.BACKFILL_USER_ID || process.env.LOCAL_DEFAULT_USER_ID || "local-user";
const userEmail = process.env.BACKFILL_USER_EMAIL || process.env.LOCAL_DEFAULT_USER_EMAIL || "local@localhost";

if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
  console.error("Invalid BACKFILL_COVER_LIMIT, expected integer in [1,1000].");
  process.exit(1);
}

async function main() {
  const response = await fetch(`${baseUrl}/api/discovery/manage/backfill-covers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      "x-user-email": userEmail,
    },
    body: JSON.stringify({
      limit,
      forceRefresh,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Backfill failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("Cover backfill summary:");
  console.log(JSON.stringify(data.summary, null, 2));

  if (Array.isArray(data.failures) && data.failures.length > 0) {
    console.log("\nSample failures:");
    console.log(JSON.stringify(data.failures.slice(0, 10), null, 2));
  }
}

main().catch((error) => {
  console.error("Backfill script crashed:", error);
  process.exit(1);
});
