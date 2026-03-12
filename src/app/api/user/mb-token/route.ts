import { NextResponse } from "next/server";

import { getLocalAuthUser } from "@/lib/local-auth";
import { dbRun } from "@/lib/local-db";

function parseTokens(input: unknown): string[] {
  if (typeof input === "string") {
    return input
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (Array.isArray(input)) {
    return input
      .map((t) => (t ? String(t).trim() : ""))
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const body = await request.json().catch(() => ({}));
    const tokens = parseTokens(body.tokens ?? body.token);

    if (tokens.length === 0) {
      return NextResponse.json({ message: "No tokens provided." }, { status: 400 });
    }

    if (tokens.length > 8) {
      return NextResponse.json({ message: "Too many tokens (max 8)." }, { status: 400 });
    }

    const sanitized = tokens
      .map((t) => t.slice(0, 128))
      .filter((t) => /[A-Za-z0-9]/.test(t));

    if (sanitized.length === 0) {
      return NextResponse.json({ message: "No valid tokens after sanitization." }, { status: 400 });
    }

    await dbRun(
      `insert into users (id, email, mb_token, updated_at)
       values (?, ?, ?, datetime('now'))
       on conflict(id) do update set
         email = coalesce(excluded.email, users.email),
         mb_token = excluded.mb_token,
         updated_at = datetime('now')`,
      [user.id, user.email, sanitized.join(",")]
    );

    return NextResponse.json({ message: "Saved", count: sanitized.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
