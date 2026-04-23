import { NextResponse } from "next/server";

import { dbGet, dbRun } from "@/lib/local-db";
import {
  computeTokenExpiryIso,
  exchangeCodeForMusicBrainzToken,
  resolveMusicBrainzOAuthConfig,
} from "@/lib/musicbrainz-oauth";

type OAuthStateRow = {
  id: string;
  mb_oauth_state: string | null;
  mb_oauth_state_expires_at: string | null;
};

function buildRedirectUrl(request: Request, status: "success" | "error", message?: string) {
  const fallbackPath = process.env.MUSICBRAINZ_OAUTH_REDIRECT_SUCCESS_PATH?.trim() || "/";
  const url = new URL(fallbackPath, request.url);
  url.searchParams.set("mb_oauth", status);
  if (message) {
    url.searchParams.set("mb_oauth_message", message.slice(0, 160));
  }
  return url;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim();
  const state = (url.searchParams.get("state") || "").trim();
  const oauthError = (url.searchParams.get("error") || "").trim();

  if (oauthError) {
    return NextResponse.redirect(
      buildRedirectUrl(request, "error", `MusicBrainz authorization failed: ${oauthError}`)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(buildRedirectUrl(request, "error", "Missing OAuth code/state."));
  }

  const config = resolveMusicBrainzOAuthConfig(request);
  if (!config) {
    return NextResponse.redirect(
      buildRedirectUrl(request, "error", "OAuth is not configured on the server.")
    );
  }

  try {
    const stateRow = await dbGet<OAuthStateRow>(
      `select id, mb_oauth_state, mb_oauth_state_expires_at
       from users
       where mb_oauth_state = ?
       limit 1`,
      [state]
    );

    if (!stateRow || !stateRow.id) {
      return NextResponse.redirect(buildRedirectUrl(request, "error", "Invalid OAuth state."));
    }

    const expiresMs = Date.parse(stateRow.mb_oauth_state_expires_at ?? "");
    if (!Number.isFinite(expiresMs) || Date.now() > expiresMs) {
      await dbRun(
        `update users
         set mb_oauth_state = null,
             mb_oauth_state_expires_at = null,
             updated_at = datetime('now')
         where id = ?`,
        [stateRow.id]
      );
      return NextResponse.redirect(buildRedirectUrl(request, "error", "OAuth state expired."));
    }

    const token = await exchangeCodeForMusicBrainzToken({
      tokenUrl: config.tokenUrl,
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });

    const expiresAt = computeTokenExpiryIso(token.expires_in);

    await dbRun(
      `update users
       set mb_oauth_access_token = ?,
           mb_oauth_refresh_token = ?,
           mb_oauth_token_type = ?,
           mb_oauth_scope = ?,
           mb_oauth_expires_at = ?,
           mb_oauth_connected_at = datetime('now'),
           mb_oauth_state = null,
           mb_oauth_state_expires_at = null,
           mb_token = ?,
           updated_at = datetime('now')
       where id = ?`,
      [
        token.access_token,
        token.refresh_token ?? null,
        token.token_type ?? "Bearer",
        token.scope ?? null,
        expiresAt,
        token.access_token,
        stateRow.id,
      ]
    );

    return NextResponse.redirect(buildRedirectUrl(request, "success", "MusicBrainz connected."));
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth callback failed.";
    return NextResponse.redirect(buildRedirectUrl(request, "error", message));
  }
}
