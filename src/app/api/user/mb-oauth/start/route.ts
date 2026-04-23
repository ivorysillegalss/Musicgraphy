import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getLocalAuthUser } from "@/lib/local-auth";
import { dbRun } from "@/lib/local-db";
import { resolveMusicBrainzOAuthConfig } from "@/lib/musicbrainz-oauth";

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const config = resolveMusicBrainzOAuthConfig(request);

    if (!config) {
      return NextResponse.json(
        { message: "MusicBrainz OAuth is not configured on the server." },
        { status: 400 }
      );
    }

    const state = randomBytes(24).toString("base64url");
    const stateExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await dbRun(
      `update users
       set mb_oauth_state = ?,
           mb_oauth_state_expires_at = ?,
           updated_at = datetime('now')
       where id = ?`,
      [state, stateExpiresAt, user.id]
    );

    const authorizeUrl = new URL(config.authorizeUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizeUrl.searchParams.set("scope", config.scope);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("approval_prompt", "auto");

    return NextResponse.json({ url: authorizeUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start OAuth flow.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
