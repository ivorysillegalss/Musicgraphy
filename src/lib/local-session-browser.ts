export type LocalSession = {
  access_token: string;
  user: {
    id: string;
    email?: string;
  };
};

type AuthCallback = (event: string, session: LocalSession | null) => void;

const SESSION_STORAGE_KEY = "dream_local_session_v1";
const AUTH_EVENT_NAME = "dream-local-auth-change";

function normalizeUserId(email: string) {
  const fromEmail = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (fromEmail) {
    return `user-${fromEmail}`;
  }

  return process.env.NEXT_PUBLIC_LOCAL_DEFAULT_USER_ID?.trim() || "local-user";
}

function createSession(email: string): LocalSession {
  const userId = normalizeUserId(email);
  return {
    access_token: `local:${userId}`,
    user: {
      id: userId,
      email,
    },
  };
}

function readSession(): LocalSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as LocalSession;
  } catch {
    return null;
  }
}

function writeSession(session: LocalSession | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  window.dispatchEvent(new CustomEvent(AUTH_EVENT_NAME, { detail: session }));
}

function ensureDefaultSession() {
  const existing = readSession();
  if (existing) {
    return existing;
  }

  // Do not default-login if accessed from a non-localhost IP to prevent remote users from having full access by default.
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const forceAuth = process.env.NEXT_PUBLIC_FORCE_DEFAULT_AUTH === "true";
    if (hostname !== "localhost" && hostname !== "127.0.0.1" && !forceAuth) {
      return null;
    }
  }

  const email =
    process.env.NEXT_PUBLIC_LOCAL_DEFAULT_USER_EMAIL?.trim() ||
    "local@localhost";
  const session = createSession(email);
  writeSession(session);
  return session;
}

export function isLocalBackendConfigured(): boolean {
  return true;
}

export function getLocalSessionClient() {
  return {
    auth: {
      async getSession() {
        return {
          data: {
            session: ensureDefaultSession(),
          },
        };
      },
      onAuthStateChange(callback: AuthCallback) {
        const listener = (event: Event) => {
          const custom = event as CustomEvent<LocalSession | null>;
          callback("LOCAL_AUTH_CHANGED", custom.detail ?? readSession());
        };

        if (typeof window !== "undefined") {
          window.addEventListener(AUTH_EVENT_NAME, listener as EventListener);
        }

        return {
          data: {
            subscription: {
              unsubscribe() {
                if (typeof window !== "undefined") {
                  window.removeEventListener(AUTH_EVENT_NAME, listener as EventListener);
                }
              },
            },
          },
        };
      },
      async signInWithPassword(params: { email: string; password: string }) {
        const session = createSession(params.email || "local@localhost");
        writeSession(session);
        return { error: null };
      },
      async signUp(params: { email: string; password: string }) {
        const session = createSession(params.email || "local@localhost");
        writeSession(session);
        return { error: null };
      },
      async signOut() {
        writeSession(null);
        return { error: null };
      },
    },
  };
}
