import { ApiHttpError } from "@/lib/api-error";
import { dbRun } from "@/lib/local-db";

export type LocalAuthUser = {
  id: string;
  email: string | null;
};

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}

function parseUserIdFromToken(token: string | null) {
  if (!token) {
    return null;
  }
  if (token.startsWith("local:")) {
    const id = token.slice("local:".length).trim();
    return id || null;
  }
  return token;
}

function parseUserId(request: Request) {
  const fromHeader = request.headers.get("x-user-id")?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const fromBearer = parseUserIdFromToken(readBearerToken(request));
  if (fromBearer) {
    return fromBearer;
  }

  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const forceAuth = process.env.NEXT_PUBLIC_FORCE_DEFAULT_AUTH === "true";

  // When accessed remotely (cloud server), do not default to local-user
  // so that unauthenticated users are forced to log in.
  if (!isLocalHost && !forceAuth) {
    return null;
  }

  return process.env.LOCAL_DEFAULT_USER_ID?.trim() || "local-user";
}

function parseUserEmail(request: Request) {
  const fromHeader = request.headers.get("x-user-email")?.trim();
  if (fromHeader) {
    return fromHeader;
  }
  return process.env.LOCAL_DEFAULT_USER_EMAIL?.trim() || "local@localhost";
}

export async function getLocalAuthUser(request: Request): Promise<LocalAuthUser> {
  const userId = parseUserId(request);
  const email = parseUserEmail(request);

  if (!userId) {
    throw new ApiHttpError(401, "UNAUTHORIZED", "Missing user id.");
  }

  await dbRun(
    `insert into users (id, email, updated_at)
     values (?, ?, datetime('now'))
     on conflict(id) do update set
       email = coalesce(excluded.email, users.email),
       updated_at = datetime('now')`,
    [userId, email]
  );

  return {
    id: userId,
    email,
  };
}
