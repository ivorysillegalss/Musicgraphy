"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Library } from "lucide-react";

import { AppNavbar } from "@/components/ui/app-navbar";
import { AuthModal } from "@/components/ui/auth-modal";
import { BottomControls } from "@/components/ui/bottom-controls";
import { GuideModal } from "@/components/ui/guide-modal";
import { OnboardingTour } from "@/components/ui/onboarding-tour";
import { LibraryDrawer } from "@/components/ui/library-drawer";
import { MbTokenModal } from "@/components/ui/mb-token-modal";
import { NeteaseImportModal } from "@/components/ui/netease-import-modal";
import { RecordShelfView } from "@/components/ui/record-shelf-view";
import { WorldMap } from "@/components/world-map";
import type { DiscoveryAlbum } from "@/lib/discovery-catalog";
import {
  getLocalSessionClient,
  isLocalBackendConfigured,
  type LocalSession,
} from "@/lib/local-session-browser";
import type { UserRecord } from "@/lib/types";

const FAVORITES_STORAGE_KEY = "pmgt_favorites_v1";
const LOCAL_RECORDS_STORAGE_KEY = "pmgt_local_records_v1";
const ONBOARDING_SEEN_KEY = "pmgt_onboarding_seen_v1";
const MIN_RELEASE_YEAR = 1960;
const MAX_RELEASE_YEAR = new Date().getFullYear();

function getYear(record: UserRecord): number {
  return record.releaseYear || new Date(record.listenAt).getFullYear();
}

function favoriteKey(album: Pick<DiscoveryAlbum, "id" | "albumTitle" | "artistName">) {
  return `${(album.id || "").toLowerCase()}::${album.albumTitle.toLowerCase()}::${album.artistName.toLowerCase()}`;
}

function normalizeCompareValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function albumArtistKey(albumTitle: string, artistName: string) {
  return `${normalizeCompareValue(albumTitle)}::${normalizeCompareValue(artistName)}`;
}

function createLocalRecordFromAlbum(album: DiscoveryAlbum): UserRecord {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    albumMbid: null,
    albumTitle: album.albumTitle,
    releaseDate: album.releaseYear ? `${album.releaseYear}-01-01` : null,
    releaseYear: album.releaseYear,
    listenAt: new Date().toISOString(),
    score: 0,
    personalTags: [],
    artistGeo: {
      artistId: `local-${album.artistName.toLowerCase().replaceAll(" ", "-")}`,
      artistName: album.artistName,
      countryCode: album.countryCode,
      countryName: album.countryName,
      cityName: album.cityName,
      coordinates: {
        lng: album.coordinates.lng,
        lat: album.coordinates.lat,
      },
    },
  };
}

export default function Home() {
  const router = useRouter();
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [pendingMapSelection, setPendingMapSelection] = useState<
    | { type: "discovery"; album: DiscoveryAlbum }
    | { type: "user"; record: UserRecord }
    | null
  >(null);

  const [session, setSession] = useState<LocalSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isUserActionLoading, setIsUserActionLoading] = useState(false);

  const [favorites, setFavorites] = useState<DiscoveryAlbum[]>([]);
  const [records, setRecords] = useState<UserRecord[]>([]);
  const [timelineRange, setTimelineRange] = useState({
    min: MIN_RELEASE_YEAR,
    max: MAX_RELEASE_YEAR,
  });
  const [isMbTokenOpen, setIsMbTokenOpen] = useState(false);
  const [isNeteaseImportOpen, setIsNeteaseImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "shelf">("map");
  const [mbTokensInput, setMbTokensInput] = useState("");
  const [isSavingMbTokens, setIsSavingMbTokens] = useState(false);
  const [isConnectingMbOAuth, setIsConnectingMbOAuth] = useState(false);
  const [mbTokenStatus, setMbTokenStatus] = useState<{
    text: string;
    tone: "success" | "error";
  } | null>(null);
  const markHeardInFlightRef = useRef<Set<string>>(new Set());

  const configured = isLocalBackendConfigured();
  const localTestMode = !configured;

  useEffect(() => {
    if (!configured) {
      return;
    }

    const hasSeenOnboarding = localStorage.getItem(ONBOARDING_SEEN_KEY);
    if (!hasSeenOnboarding) {
      setIsOnboardingOpen(true);
      localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    }

    const client = getLocalSessionClient();
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = (url.searchParams.get("mb_oauth") || "").trim();
    if (!status) {
      return;
    }

    const rawMessage = (url.searchParams.get("mb_oauth_message") || "").trim();
    const message = rawMessage || (status === "success" ? "MusicBrainz OAuth connected." : "MusicBrainz OAuth failed.");

    if (status === "success") {
      setMbTokenStatus({ text: message, tone: "success" });
      toast.success(message);
    } else {
      setMbTokenStatus({ text: message, tone: "error" });
      toast.error(message);
    }

    url.searchParams.delete("mb_oauth");
    url.searchParams.delete("mb_oauth_message");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (!configured) {
      setFavorites([]);
      return;
    }
    if (!session) {
      setFavorites([]);
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/favorites", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (Array.isArray(data.favorites)) {
          setFavorites(data.favorites);
        }
      } catch (error) {
        console.error("Failed to fetch favorites", error);
      }
    })();
  }, [configured, session]);

  useEffect(() => {
    if (!configured || !session) {
      return;
    }

    // One-time compatibility import for legacy localStorage favorites.
    void (async () => {
      try {
        const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as DiscoveryAlbum[];
        if (!Array.isArray(parsed) || parsed.length === 0) {
          window.localStorage.removeItem(FAVORITES_STORAGE_KEY);
          return;
        }

        const existing = new Set(favorites.map(favoriteKey));
        const toImport = parsed.filter((item) => !existing.has(favoriteKey(item)));
        if (toImport.length === 0) {
          window.localStorage.removeItem(FAVORITES_STORAGE_KEY);
          return;
        }

        await fetch("/api/favorites", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ items: toImport }),
        });

        window.localStorage.removeItem(FAVORITES_STORAGE_KEY);

        const refresh = await fetch("/api/favorites", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await refresh.json();
        if (Array.isArray(data.favorites)) {
          setFavorites(data.favorites);
        }
      } catch (error) {
        console.error("Failed to import legacy favorites", error);
      }
    })();
  }, [configured, favorites, session]);

  useEffect(() => {
    if (configured) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_RECORDS_STORAGE_KEY);
      if (raw) {
        setRecords(JSON.parse(raw));
      }
    } catch {
      setRecords([]);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) {
      window.localStorage.setItem(LOCAL_RECORDS_STORAGE_KEY, JSON.stringify(records));
    }
  }, [configured, records]);

  async function refreshRecords() {
    if (!configured) {
      setRecords([]);
      return;
    }
    if (!session) {
      setRecords([]);
      return;
    }

    try {
      const res = await fetch("/api/records", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (Array.isArray(data.records)) {
        setRecords(data.records);
      }
    } catch (error) {
      console.error("Failed to fetch records", error);
    }
  }

  useEffect(() => {
    void refreshRecords();
  }, [configured, session]);

  async function signOut() {
    if (!configured) {
      return;
    }
    await getLocalSessionClient().auth.signOut();
    setSession(null);
  }

  async function signUpWithEmailPassword(email: string, pass: string) {
    setIsUserActionLoading(true);
    setAuthError(null);
    setAuthMessage(null);

    if (!configured) {
      setAuthError("本地后端未启用，当前无法注册。");
      setIsUserActionLoading(false);
      return;
    }

    try {
      const client = getLocalSessionClient();
      const { error } = await client.auth.signUp({ email, password: pass });
      if (error) {
        throw error;
      }
      setAuthMessage("注册成功，现在可以登录并在地图上标记已听专辑。");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "注册失败");
    } finally {
      setIsUserActionLoading(false);
    }
  }

  async function signInWithEmailPassword(email: string, pass: string) {
    setIsUserActionLoading(true);
    setAuthError(null);
    setAuthMessage(null);

    if (!configured) {
      setAuthError("本地后端未启用，当前无法登录。");
      setIsUserActionLoading(false);
      return;
    }

    try {
      const client = getLocalSessionClient();
      const { error } = await client.auth.signInWithPassword({
        email,
        password: pass,
      });
      if (error) {
        throw error;
      }
      setAuthMessage("登录成功，现在可以在地图上直接标记已听专辑。");
      setIsAuthOpen(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setIsUserActionLoading(false);
    }
  }

  function openMbTokenModal() {
    if (!configured) {
      toast.error("本地后端未启用，无法保存 MusicBrainz token。");
      return;
    }
    if (!session) {
      setIsAuthOpen(true);
      toast.info("请先登录再保存 MusicBrainz token。");
      return;
    }
    setMbTokenStatus(null);
    setIsMbTokenOpen(true);
  }

  async function saveMbTokens() {
    if (!configured) {
      toast.error("本地后端未启用，无法保存 MusicBrainz token。");
      return;
    }
    if (!session) {
      setIsAuthOpen(true);
      toast.info("请先登录再保存 MusicBrainz token。");
      return;
    }
    if (!mbTokensInput.trim()) {
      setMbTokenStatus({ text: "请至少填写一个 token。", tone: "error" });
      return;
    }

    setIsSavingMbTokens(true);
    setMbTokenStatus(null);

    try {
      const res = await fetch("/api/user/mb-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tokens: mbTokensInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "保存失败");
      }

      setMbTokenStatus({ text: data?.message || "已保存。", tone: "success" });
      toast.success(data?.message || "已保存 MusicBrainz token");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setMbTokenStatus({ text: message, tone: "error" });
      toast.error(message);
    } finally {
      setIsSavingMbTokens(false);
    }
  }

  async function connectMusicBrainzOAuth() {
    if (!configured) {
      toast.error("本地后端未启用，无法连接 MusicBrainz OAuth。");
      return;
    }
    if (!session) {
      setIsAuthOpen(true);
      toast.info("请先登录后再连接 MusicBrainz OAuth。");
      return;
    }

    setIsConnectingMbOAuth(true);
    setMbTokenStatus(null);

    try {
      const res = await fetch("/api/user/mb-oauth/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.url !== "string") {
        throw new Error(data?.message || "Failed to start MusicBrainz OAuth.");
      }

      window.location.assign(data.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect MusicBrainz OAuth.";
      setMbTokenStatus({ text: message, tone: "error" });
      toast.error(message);
      setIsConnectingMbOAuth(false);
    }
  }

  async function markAlbumHeard(album: DiscoveryAlbum) {
    const targetKey = albumArtistKey(album.albumTitle, album.artistName);
    if (markHeardInFlightRef.current.has(targetKey)) {
      return;
    }

    markHeardInFlightRef.current.add(targetKey);

    if (!configured) {
      const existing = records.find(
        (r) => albumArtistKey(r.albumTitle, r.artistGeo.artistName) === targetKey
      );

      if (existing) {
        setRecords((prev) => prev.filter((r) => r.id !== existing.id));
        toast.info("Removed from history");
      } else {
        setRecords((prev) => [createLocalRecordFromAlbum(album), ...prev]);
        toast.success("Marked as heard");
      }
      markHeardInFlightRef.current.delete(targetKey);
      return;
    }

    if (!session) {
      setIsAuthOpen(true);
      markHeardInFlightRef.current.delete(targetKey);
      return;
    }

    const loadId = toast.loading("Processing...");

    try {
      const existing = records.find(
        (r) => albumArtistKey(r.albumTitle, r.artistGeo.artistName) === targetKey
      );

      if (existing) {
        const res = await fetch("/api/records/mark-heard", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            recordId: existing.id,
          }),
        });

        if (!res.ok) {
          throw new Error("Unmark failed");
        }

        setRecords((prev) =>
          prev.filter(
            (r) => r.id !== existing.id
          )
        );

        toast.dismiss(loadId);
        toast.info("Removed from history");
      } else {
        const res = await fetch("/api/records/mark-heard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            albumTitle: album.albumTitle,
            artistName: album.artistName,
            releaseYear: album.releaseYear,
            countryCode: album.countryCode,
            countryName: album.countryName,
            cityName: album.cityName,
            coordinates: album.coordinates,
          }),
        });

        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error?.message || payload?.message || "Mark failed");
        }

        const created = payload as UserRecord;
        setRecords((prev) => {
          const next = prev.filter(
            (r) => albumArtistKey(r.albumTitle, r.artistGeo.artistName) !== targetKey
          );
          return [created, ...next];
        });

        toast.dismiss(loadId);
        toast.success("Marked as heard");
      }
    } catch (error) {
      console.error(error);
      toast.dismiss(loadId);
      toast.error("Operation failed");
    } finally {
      markHeardInFlightRef.current.delete(targetKey);
    }
  }

  async function unmarkRecord(record: UserRecord) {
    if (!configured) {
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      toast.info("Removed from history");
      return;
    }

    if (!session) {
      return;
    }

    const loadId = toast.loading("Removing...");

    try {
      const res = await fetch("/api/records/mark-heard", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          albumTitle: record.albumTitle,
          artistName: record.artistGeo.artistName,
        }),
      });

      if (!res.ok) {
        throw new Error("Delete failed");
      }

      const targetKey = albumArtistKey(record.albumTitle, record.artistGeo.artistName);
      setRecords((prev) =>
        prev.filter((r) => albumArtistKey(r.albumTitle, r.artistGeo.artistName) !== targetKey)
      );

      toast.dismiss(loadId);
      toast.info("Removed from history");
    } catch (error) {
      console.error(error);
      toast.dismiss(loadId);
      toast.error("Failed to remove");
    }
  }

  function toggleFavorite(album: DiscoveryAlbum) {
    if (!configured || !session) {
      setIsAuthOpen(true);
      toast.info("请先登录后再收藏。");
      return;
    }

    const wasFavorite = favorites.some(
      (item) =>
        item.id === album.id ||
        (item.albumTitle === album.albumTitle && item.artistName === album.artistName)
    );

    setFavorites((prev) => {
      if (wasFavorite) {
        return prev.filter(
          (item) =>
            item.id !== album.id &&
            !(item.albumTitle === album.albumTitle && item.artistName === album.artistName)
        );
      }
      return [album, ...prev];
    });

    void (async () => {
      try {
        const res = await fetch("/api/favorites", {
          method: wasFavorite ? "DELETE" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            id: album.id,
            albumTitle: album.albumTitle,
            artistName: album.artistName,
            releaseYear: album.releaseYear,
            countryCode: album.countryCode,
            countryName: album.countryName,
            cityName: album.cityName,
            coordinates: album.coordinates,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to update favorite");
        }

        if (wasFavorite) {
          toast.info("Removed from favorites");
        } else {
          toast.success("Added to favorites");
        }
      } catch (error) {
        console.error(error);
        toast.error("收藏操作失败，已恢复状态。");

        // Re-sync from backend to avoid local and server drifting apart.
        try {
          const refresh = await fetch("/api/favorites", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const data = await refresh.json();
          if (Array.isArray(data.favorites)) {
            setFavorites(data.favorites);
          }
        } catch (refreshError) {
          console.error("Failed to refresh favorites after error", refreshError);
        }
      }
    })();
  }

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const year = getYear(record);
        return year >= timelineRange.min && year <= timelineRange.max;
      }),
    [records, timelineRange]
  );

  const recordYearSummary = useMemo(() => {
    if (filteredRecords.length === 0) {
      return "No records";
    }
    const years = filteredRecords.map(getYear);
    return `${Math.min(...years)} - ${Math.max(...years)}`;
  }, [filteredRecords]);

  const preferredCountries = useMemo(() => {
    const frequency = new Map<string, number>();
    for (const record of filteredRecords) {
      if (record.artistGeo.countryCode) {
        frequency.set(
          record.artistGeo.countryCode,
          (frequency.get(record.artistGeo.countryCode) || 0) + 1
        );
      }
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([countryCode]) => countryCode);
  }, [filteredRecords]);

  function handleScoreUpdate(recordId: string, newScore: number) {
    setRecords((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, score: newScore } : r)),
    );
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#0c0c0c] text-[#ece8e1] font-sans">
      <AnimatePresence mode="wait">
        {viewMode === "map" ? (
          <motion.div
            key="map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-0"
          >
            <WorldMap
              userRecords={filteredRecords}
              isAuthenticated={localTestMode || Boolean(session)}
              userId={session?.user.id}
              favorites={favorites}
              preferredCountries={preferredCountries}
              yearRange={timelineRange}
              externalSelection={pendingMapSelection}
              onExternalSelectionHandled={() => setPendingMapSelection(null)}
              onToggleFavorite={toggleFavorite}
              onMarkHeard={markAlbumHeard}
            />
          </motion.div>
        ) : (
          <motion.div
            key="shelf"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-0"
          >
            <RecordShelfView records={filteredRecords} onScoreUpdate={handleScoreUpdate} accessToken={session?.access_token} />
          </motion.div>
        )}
      </AnimatePresence>

      <AppNavbar
        userEmail={session?.user.email}
        isLocalMode={localTestMode}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenMbTokens={openMbTokenModal}
        onOpenNeteaseImport={() => setIsNeteaseImportOpen(true)}
        onOpenManage={() => {
          router.push("/manage/discovery");
        }}
        onSignOut={signOut}
        onAuthClick={() => setIsAuthOpen(true)}
      />

      <BottomControls
        timelineRange={timelineRange}
        setTimelineRange={setTimelineRange}
        minYear={MIN_RELEASE_YEAR}
        maxYear={MAX_RELEASE_YEAR}
        recordsCount={filteredRecords.length}
        yearSummary={recordYearSummary}
      />

      <button
        onClick={() => setIsLibraryOpen(true)}
        className="fixed bottom-32 right-6 z-40 flex items-center justify-center h-10 w-10 rounded-full border border-white/[0.06] bg-[#141414]/80 text-[#9a948c] shadow-lg shadow-black/30 hover:bg-[#1c1c1c] hover:text-[#ece8e1] hover:border-white/[0.1] transition-all group"
        title="Open Library"
      >
        <Library size="15" className="group-hover:text-[#c9a04a]/70 transition-colors" />
        {favorites.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#8a4a5a]/80 text-[8px] font-bold text-white">
            {favorites.length > 99 ? "99+" : favorites.length}
          </span>
        )}
      </button>

      <OnboardingTour
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />

      <GuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        isConfigured={configured}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        isLoading={isUserActionLoading}
        error={authError}
        message={authMessage}
        onSignIn={signInWithEmailPassword}
        onSignUp={signUpWithEmailPassword}
      />

      <MbTokenModal
        isOpen={isMbTokenOpen}
        value={mbTokensInput}
        onChange={setMbTokensInput}
        onClose={() => {
          setIsMbTokenOpen(false);
          setIsSavingMbTokens(false);
          setIsConnectingMbOAuth(false);
          setMbTokenStatus(null);
        }}
        onSave={saveMbTokens}
        onConnectOAuth={connectMusicBrainzOAuth}
        isSaving={isSavingMbTokens}
        isConnectingOAuth={isConnectingMbOAuth}
        oauthEnabled={configured}
        message={mbTokenStatus}
      />

      <NeteaseImportModal
        isOpen={isNeteaseImportOpen}
        onClose={() => setIsNeteaseImportOpen(false)}
        sessionToken={session?.access_token}
        userId={session?.user.id}
        onImported={refreshRecords}
      />

      <LibraryDrawer
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        favorites={favorites}
        records={records}
        onToggleFavorite={toggleFavorite}
        onMarkHeard={markAlbumHeard}
        onUnmark={unmarkRecord}
        onLocateFavorite={(album) => {
          setPendingMapSelection({ type: "discovery", album });
          setIsLibraryOpen(false);
        }}
        onLocateRecord={(record) => {
          setPendingMapSelection({ type: "user", record });
          setIsLibraryOpen(false);
        }}
      />
    </main>
  );
}
