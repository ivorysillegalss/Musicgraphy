export type MusicBrainzOAuthConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scope: string;
};

type OAuthTokenResponse = {
  access_token: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
};

function normalizeOrigin(input: string) {
  return input.replace(/\/+$/, "");
}

export function resolveMusicBrainzOAuthConfig(request: Request): MusicBrainzOAuthConfig | null {
  const clientId = process.env.MUSICBRAINZ_OAUTH_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.MUSICBRAINZ_OAUTH_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    return null;
  }

  const oauthBase = normalizeOrigin(
    process.env.MUSICBRAINZ_OAUTH_BASE_URL?.trim() || "https://musicbrainz.org"
  );
  const redirectUri =
    process.env.MUSICBRAINZ_OAUTH_REDIRECT_URI?.trim() ||
    `${new URL(request.url).origin}/api/user/mb-oauth/callback`;
  const scope = process.env.MUSICBRAINZ_OAUTH_SCOPE?.trim() || "profile email";

  return {
    clientId,
    clientSecret,
    authorizeUrl: `${oauthBase}/oauth2/authorize`,
    tokenUrl: `${oauthBase}/oauth2/token`,
    redirectUri,
    scope,
  };
}

async function requestToken(
  tokenUrl: string,
  body: URLSearchParams
): Promise<OAuthTokenResponse> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const raw = await response.text();
  let payload: Record<string, unknown> = {};

  try {
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorDescription =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : raw || `HTTP ${response.status}`;
    throw new Error(`MusicBrainz OAuth token exchange failed: ${errorDescription}`);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    throw new Error("MusicBrainz OAuth token exchange returned no access_token.");
  }

  return {
    access_token: accessToken,
    token_type: typeof payload.token_type === "string" ? payload.token_type : undefined,
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
    expires_in: typeof payload.expires_in === "number" ? payload.expires_in : undefined,
    refresh_token:
      typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
  };
}

export async function exchangeCodeForMusicBrainzToken(args: {
  tokenUrl: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
  });

  return requestToken(args.tokenUrl, body);
}

export async function refreshMusicBrainzAccessToken(args: {
  tokenUrl: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  });

  return requestToken(args.tokenUrl, body);
}

export function computeTokenExpiryIso(expiresInSeconds?: number) {
  if (!Number.isFinite(expiresInSeconds)) {
    return null;
  }
  const safeSeconds = Math.max(0, Math.trunc(expiresInSeconds as number));
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}
