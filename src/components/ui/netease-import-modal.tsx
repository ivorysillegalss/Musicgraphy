"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Info, ChevronDown, ChevronUp, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { toast } from "sonner";
import { QR_STATUS } from "@/lib/netease";

type NeteaseImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  sessionToken?: string;
  userId?: string;
};

type ImportSummary = {
  fetched: number;
  imported: number;
  skipped: number;
  failed: number;
};

type FailureItem = {
  artistName: string;
  albumTitle: string;
  reason: string;
};

type AlbumPreviewItem = {
  dedupKey: string;
  artistName: string;
  albumTitle: string;
  savedAt: string;
  isNew: boolean;
};

type Step = "auth" | "preview" | "importing" | "done";

export function NeteaseImportModal({
  isOpen,
  onClose,
  sessionToken,
  userId,
}: NeteaseImportModalProps) {
  const { t } = useLanguage();
  const net = t.netease;

  // Login method
  const [authType, setAuthType] = useState<"phone" | "qr" | "cookie">("phone");

  // Phone login
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [needCaptcha, setNeedCaptcha] = useState(false);

  // Cookie login
  const [cookieValue, setCookieValue] = useState("");
  const [musicU, setMusicU] = useState("");
  const [csrf, setCsrf] = useState("");

  // QR login
  const [qrKey, setQrKey] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("");
  const [isQrPolling, setIsQrPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Import source
  const [importType, setImportType] = useState<"saved" | "playlist">("saved");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [limit, setLimit] = useState(50);

  // Refs to capture latest values for the QR polling closure
  const qrImportTypeRef = useRef(importType);
  qrImportTypeRef.current = importType;
  const qrPlaylistUrlRef = useRef(playlistUrl);
  qrPlaylistUrlRef.current = playlistUrl;
  const qrLimitRef = useRef(limit);
  qrLimitRef.current = limit;

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [failures, setFailures] = useState<FailureItem[]>([]);
  const [failuresOpen, setFailuresOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step tracking
  const [step, setStep] = useState<Step>("auth");
  const [albumPreview, setAlbumPreview] = useState<AlbumPreviewItem[]>([]);
  const [selectedAlbumKeys, setSelectedAlbumKeys] = useState<string[]>([]);
  const [authRequestBody, setAuthRequestBody] = useState<Record<string, unknown> | null>(null);

  // QR auto-retry
  const qrRetryCountRef = useRef(0);
  const generateQRRef = useRef<() => void>(() => {});

  // Build cookie string from separate fields
  function buildCookieString() {
    if (musicU.trim() && csrf.trim()) {
      return `MUSIC_U=${musicU.trim()}; __csrf=${csrf.trim()}`;
    }
    return cookieValue.trim();
  }

  function resetForm() {
    stopQrPolling();
    setQrKey(null);
    setQrImage(null);
    setQrStatus("");
    setIsQrPolling(false);
    setStep("auth");
    setAlbumPreview([]);
    setSelectedAlbumKeys([]);
    setAuthRequestBody(null);
    setSummary(null);
    setFailures([]);
    setFailuresOpen(false);
    setError(null);
    setNeedCaptcha(false);
    qrRetryCountRef.current = 0;
  }

  function resetAuthOnly() {
    setSummary(null);
    setFailures([]);
    setFailuresOpen(false);
    setError(null);
    setNeedCaptcha(false);
  }

  // ── QR Login ───────────────────────────────────────────────────────

  function stopQrPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsQrPolling(false);
  }

  useEffect(() => {
    return () => stopQrPolling();
  }, []);

  async function handleQrPreview(cookie: string) {
    stopQrPolling();
    toast.success(net.qrAuthorized);
    setQrStatus("Login successful, loading albums...");

    const body: Record<string, unknown> = {
      authType: "qr",
      cookie,
      importType: qrImportTypeRef.current,
      playlistUrl: qrPlaylistUrlRef.current.trim() || undefined,
      limit: qrLimitRef.current,
    };

    setIsProcessing(true);
    try {
      const res = await fetch("/api/records/import/netease", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
          "x-user-id": userId ?? "",
        },
        body: JSON.stringify({ ...body, preview: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.message || "Preview failed");

      setAlbumPreview(data.albums ?? []);
      setSelectedAlbumKeys(
        (data.albums ?? [])
          .filter((a: AlbumPreviewItem) => a.isNew)
          .map((a: AlbumPreviewItem) => a.dedupKey)
      );
      setAuthRequestBody(body);
      setQrStatus(net.qrAuthorized);
      setStep("preview");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview failed";
      setError(message);
      toast.error(message);
      setQrStatus("");
    } finally {
      setIsProcessing(false);
    }
  }

  function startQrPolling(key: string) {
    stopQrPolling();
    setIsQrPolling(true);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/netease/qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", key }),
        });
        const data = await res.json();

        if (data.status === QR_STATUS.AUTHORIZED) {
          await handleQrPreview(data.cookie);
          return;
        }

        if (data.status === QR_STATUS.EXPIRED) {
          setQrStatus(net.qrExpired);
          stopQrPolling();
          qrRetryCountRef.current += 1;
          if (qrRetryCountRef.current < 3) {
            setTimeout(() => generateQRRef.current(), 3000);
          }
          return;
        }

        if (data.status === QR_STATUS.SCANNED) {
          setQrStatus(net.qrScanned);
          return;
        }

        setQrStatus(net.qrWaiting);
      } catch {
        setQrStatus(net.qrError);
        stopQrPolling();
      }
    }, 2000);
  }

  async function generateQRCode() {
    qrRetryCountRef.current = 0;
    resetAuthOnly();
    setQrKey(null);
    setQrImage(null);
    setQrStatus(net.qrGenerating);

    try {
      const keyRes = await fetch("/api/netease/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "key" }),
      });
      const keyData = await keyRes.json();
      if (!keyRes.ok || !keyData.unikey) throw new Error(keyData.error?.message || "Failed to get QR key");

      const imgRes = await fetch("/api/netease/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", key: keyData.unikey }),
      });
      const imgData = await imgRes.json();
      if (!imgRes.ok || !imgData.qrimg) throw new Error(imgData.error?.message || "Failed to create QR code");

      setQrKey(keyData.unikey);
      setQrImage(imgData.qrimg);
      setQrStatus(net.qrWaiting);
      startQrPolling(keyData.unikey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "QR generation failed";
      setError(message);
      setQrStatus("");
    }
  }

  generateQRRef.current = generateQRCode;

  // ── Preview (phone / cookie) ───────────────────────────────────────

  async function handlePreview() {
    if (authType === "phone" && (!phone.trim() || !password.trim())) {
      toast.error("Phone and password are required");
      return;
    }
    if (authType === "cookie" && !buildCookieString()) {
      toast.error("Cookie is required");
      return;
    }

    const body: Record<string, unknown> = {
      authType,
      importType,
      playlistUrl: playlistUrl.trim() || undefined,
      limit,
    };

    if (authType === "phone") {
      body.phone = phone.trim();
      body.password = password.trim();
      body.captcha = captcha.trim() || undefined;
    } else {
      body.cookie = buildCookieString();
    }

    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/records/import/netease", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
          "x-user-id": userId ?? "",
        },
        body: JSON.stringify({ ...body, preview: true }),
      });

      const data = await res.json();

      if (data.needCaptcha) {
        setNeedCaptcha(true);
        setError(data.message || "Verification code sent to your phone.");
        toast.info("Verification code sent to your phone");
        setIsProcessing(false);
        return;
      }

      if (!res.ok) throw new Error(data?.error?.message || data?.message || "Preview failed");

      setAlbumPreview(data.albums ?? []);
      setSelectedAlbumKeys(
        (data.albums ?? [])
          .filter((a: AlbumPreviewItem) => a.isNew)
          .map((a: AlbumPreviewItem) => a.dedupKey)
      );
      setAuthRequestBody(body);
      setStep("preview");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview failed";
      setError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  }

  // ── Import (from preview step) ─────────────────────────────────────

  async function handleImport() {
    if (selectedAlbumKeys.length === 0) {
      toast.error("No albums selected");
      return;
    }

    setStep("importing");
    setError(null);

    const loadId = toast.loading(net.importing);

    try {
      const res = await fetch("/api/records/import/netease", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
          "x-user-id": userId ?? "",
        },
        body: JSON.stringify({
          ...authRequestBody,
          selected: selectedAlbumKeys,
        }),
      });

      const data = await res.json();

      if (data.needCaptcha) {
        setStep("preview");
        setNeedCaptcha(true);
        setError(data.message || "Verification code required");
        toast.error("Verification code required", { id: loadId });
        return;
      }

      if (!res.ok) throw new Error(data?.error?.message || data?.message || "Import failed");

      setSummary(data.summary);
      setFailures(data.failures ?? []);
      setStep("done");

      const s = data.summary;
      const msg = `${net.summaryFetched} ${s.fetched}, ${net.summaryImported} ${s.imported}, ${net.summarySkipped} ${s.skipped}, ${net.summaryFailed} ${s.failed}`;
      toast.success(msg, { id: loadId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
      toast.error(message, { id: loadId });
      setStep("preview");
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  function toggleAlbum(key: string) {
    setSelectedAlbumKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function selectAll() {
    setSelectedAlbumKeys(albumPreview.map((a) => a.dedupKey));
  }

  function deselectAll() {
    setSelectedAlbumKeys([]);
  }

  // ── Render ─────────────────────────────────────────────────────────

  function renderBody() {
    if (step === "preview") {
      return renderPreview();
    }
    if (step === "importing") {
      return renderImporting();
    }
    if (step === "done") {
      return renderDone();
    }
    return renderAuthForm();
  }

  function renderAuthForm() {
    return (
      <div className="space-y-4">
        {/* Auth type tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => { setAuthType("phone"); resetForm(); }}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              authType === "phone"
                ? "bg-[#c9a04a]/15 text-[#c9a04a] border border-[#c9a04a]/30"
                : "bg-black/30 text-[#9a948c] border border-white/[0.06] hover:text-[#ece8e1]"
            }`}
          >
            {net.phoneTab}
          </button>
          <button
            onClick={() => { setAuthType("qr"); resetForm(); }}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              authType === "qr"
                ? "bg-[#c9a04a]/15 text-[#c9a04a] border border-[#c9a04a]/30"
                : "bg-black/30 text-[#9a948c] border border-white/[0.06] hover:text-[#ece8e1]"
            }`}
          >
            {net.qrTab}
          </button>
          <button
            onClick={() => { setAuthType("cookie"); resetForm(); }}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              authType === "cookie"
                ? "bg-[#c9a04a]/15 text-[#c9a04a] border border-[#c9a04a]/30"
                : "bg-black/30 text-[#9a948c] border border-white/[0.06] hover:text-[#ece8e1]"
            }`}
          >
            {net.cookieTab}
          </button>
        </div>

        {/* Phone login */}
        {authType === "phone" && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c]">{net.phoneLabel}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); resetAuthOnly(); }}
                  placeholder="13800138000"
                  className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-3 py-2 text-sm text-[#ece8e1] focus:outline-none focus:border-[#c9a04a]/30 transition-all placeholder:text-[#9a948c]"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c]">{net.passwordLabel}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); resetAuthOnly(); }}
                  placeholder="********"
                  className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-3 py-2 text-sm text-[#ece8e1] focus:outline-none focus:border-[#c9a04a]/30 transition-all placeholder:text-[#9a948c]"
                />
              </div>
            </div>

            {needCaptcha && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9a04a]">{net.captchaLabel}</label>
                <input
                  type="text"
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  placeholder={net.captchaHint}
                  className="w-full rounded-lg bg-black/30 border border-[#c9a04a]/30 px-3 py-2 text-sm text-[#ece8e1] focus:outline-none focus:border-[#c9a04a]/60 transition-all placeholder:text-[#9a948c]"
                />
                <p className="text-[11px] text-[#9a948c]">{net.captchaHint}</p>
              </div>
            )}
          </div>
        )}

        {/* QR login */}
        {authType === "qr" && (
          <div className="space-y-4">
            {!qrImage ? (
              <button
                onClick={() => void generateQRCode()}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#c9a04a]/15 border border-[#c9a04a]/30 px-4 py-6 text-sm text-[#c9a04a] hover:bg-[#c9a04a]/20 transition-all disabled:opacity-40"
              >
                <Smartphone className="h-5 w-5" />
                <span>{net.qrGenerateButton}</span>
              </button>
            ) : isProcessing ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#c9a04a]" />
                <p className="text-sm text-[#9a948c]">{qrStatus || "Loading..."}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImage}
                  alt="QR Code"
                  className="w-48 h-48 rounded-lg bg-white p-2"
                />
                <p className="text-xs text-[#9a948c] text-center leading-relaxed">
                  {net.qrScanHint}
                </p>
                <div className="flex items-center gap-2 text-xs text-[#c9a04a]">
                  {isQrPolling && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{qrStatus}</span>
                </div>
                <div className="flex items-center gap-3">
                  {qrStatus === net.qrExpired ? (
                    <button
                      onClick={() => void generateQRCode()}
                      className="text-xs text-[#c9a04a] hover:underline"
                    >
                      {net.qrRetry}
                    </button>
                  ) : (
                    <button
                      onClick={() => void generateQRCode()}
                      className="text-[11px] text-[#9a948c] hover:text-[#ece8e1] underline-offset-2 hover:underline transition-all"
                    >
                      Refresh QR
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cookie login */}
        {authType === "cookie" && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c]">{net.musicULabel}</label>
                <input
                  type="text"
                  value={musicU}
                  onChange={(e) => { setMusicU(e.target.value); resetAuthOnly(); }}
                  placeholder="MUSIC_U=001522..."
                  className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-3 py-2 text-sm text-[#ece8e1] focus:outline-none focus:border-[#c9a04a]/30 transition-all placeholder:text-[#9a948c] font-mono text-[10px]"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c]">{net.csrfLabel}</label>
                <input
                  type="text"
                  value={csrf}
                  onChange={(e) => { setCsrf(e.target.value); resetAuthOnly(); }}
                  placeholder="__csrf=be307d..."
                  className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-3 py-2 text-sm text-[#ece8e1] focus:outline-none focus:border-[#c9a04a]/30 transition-all placeholder:text-[#9a948c] font-mono text-[10px]"
                />
              </div>
            </div>
            <details className="group">
              <summary className="text-[11px] text-[#9a948c] cursor-pointer hover:text-[#ece8e1] transition-all">
                {net.cookieFallbackToggle}
              </summary>
              <div className="mt-2 space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c]">{net.cookieLabel}</label>
                <textarea
                  value={cookieValue}
                  onChange={(e) => { setCookieValue(e.target.value); resetAuthOnly(); }}
                  placeholder={net.cookieHint}
                  rows={3}
                  className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-3 py-2 text-sm text-[#ece8e1] focus:outline-none focus:border-[#c9a04a]/30 transition-all placeholder:text-[#9a948c] resize-none"
                />
              </div>
            </details>
          </div>
        )}

        {/* Import source */}
        <div className="space-y-3">
            <label className="text-[11px] font-medium text-[#9a948c]">{net.sourceLabel}</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setImportType("saved"); resetAuthOnly(); }}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  importType === "saved"
                    ? "bg-[#c9a04a]/15 text-[#c9a04a] border border-[#c9a04a]/30"
                    : "bg-black/30 text-[#9a948c] border border-white/[0.06] hover:text-[#ece8e1]"
                }`}
              >
                {net.sourceSaved}
              </button>
              <button
                onClick={() => { setImportType("playlist"); resetAuthOnly(); }}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  importType === "playlist"
                    ? "bg-[#c9a04a]/15 text-[#c9a04a] border border-[#c9a04a]/30"
                    : "bg-black/30 text-[#9a948c] border border-white/[0.06] hover:text-[#ece8e1]"
                }`}
              >
                {net.sourcePlaylist}
              </button>
            </div>

            {importType === "playlist" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c]">{net.playlistUrlLabel}</label>
                <input
                  type="url"
                  value={playlistUrl}
                  onChange={(e) => { setPlaylistUrl(e.target.value); resetAuthOnly(); }}
                  placeholder="https://music.163.com/playlist?id=123456789"
                  className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-3 py-2 text-sm text-[#ece8e1] focus:outline-none focus:border-[#c9a04a]/30 transition-all placeholder:text-[#9a948c]"
                />
              </div>
            )}
          </div>

        {/* Limit */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[#9a948c]">{net.limitLabel}</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => {
              const v = Math.min(200, Math.max(1, Number(e.target.value) || 1));
              setLimit(v);
            }}
            min={1}
            max={200}
            className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-3 py-2 text-sm text-[#ece8e1] focus:outline-none focus:border-[#c9a04a]/30 transition-all placeholder:text-[#9a948c]"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-[#8a4a5a]/20 bg-[#8a4a5a]/[0.04] px-3 py-2 text-xs text-[#8a4a5a]/90">
            {error}
          </div>
        )}
      </div>
    );
  }

  function renderPreview() {
    const newCount = albumPreview.filter((a) => a.isNew).length;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#9a948c]">
            {albumPreview.length} albums &middot; {newCount} new
          </p>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-[11px] text-[#c9a04a]/70 hover:text-[#c9a04a] transition-all"
            >
              {net.selectAll}
            </button>
            <button
              onClick={deselectAll}
              className="text-[11px] text-[#9a948c] hover:text-[#ece8e1] transition-all"
            >
              {net.deselectAll}
            </button>
          </div>
        </div>

        {/* Album list */}
        <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
          {albumPreview.map((item) => {
            const checked = selectedAlbumKeys.includes(item.dedupKey);
            return (
              <label
                key={item.dedupKey}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all ${
                  checked
                    ? "bg-[#c9a04a]/8 border border-[#c9a04a]/15"
                    : "bg-black/20 border border-transparent hover:bg-white/[0.03]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAlbum(item.dedupKey)}
                  className="accent-[#c9a04a] h-3.5 w-3.5 rounded"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#ece8e1] truncate">
                    {item.artistName} — {item.albumTitle}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                    item.isNew
                      ? "bg-[#4a8a6a]/15 text-[#4a8a6a]"
                      : "bg-[#9a948c]/10 text-[#9a948c]"
                  }`}
                >
                  {item.isNew ? "NEW" : "EXISTS"}
                </span>
              </label>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-[#8a4a5a]/20 bg-[#8a4a5a]/[0.04] px-3 py-2 text-xs text-[#8a4a5a]/90">
            {error}
          </div>
        )}
      </div>
    );
  }

  function renderImporting() {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#c9a04a]" />
        <p className="text-sm text-[#9a948c]">{net.importing}</p>
        {error && (
          <div className="rounded-lg border border-[#8a4a5a]/20 bg-[#8a4a5a]/[0.04] px-3 py-2 text-xs text-[#8a4a5a]/90">
            {error}
          </div>
        )}
      </div>
    );
  }

  function renderDone() {
    return (
      <div className="space-y-3">
        {summary && (
          <div className="rounded-lg border border-[#4a8a6a]/20 bg-[#4a8a6a]/[0.04] p-3 text-sm space-y-2">
            <p className="text-xs text-[#4a8a6a]/90">
              {net.summaryFetched}: {summary.fetched} &middot;{" "}
              {net.summaryImported}: {summary.imported} &middot;{" "}
              {net.summarySkipped}: {summary.skipped} &middot;{" "}
              {net.summaryFailed}: {summary.failed}
            </p>

            {failures.length > 0 && (
              <div>
                <button
                  onClick={() => setFailuresOpen(!failuresOpen)}
                  className="flex items-center gap-1 text-xs text-[#8a4a5a]/80 hover:text-[#8a4a5a] transition-all"
                >
                  {failuresOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {net.failuresTitle} ({failures.length})
                </button>
                {failuresOpen && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {failures.map((f, i) => (
                      <div key={i} className="text-[11px] text-[#9a948c] border-b border-white/[0.03] pb-1">
                        <span className="text-[#ece8e1]">{f.artistName}</span> — {f.albumTitle}
                        <br />
                        <span className="text-[#8a4a5a]/60">{f.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {failures.length === 0 && (
              <p className="text-xs text-[#4a8a6a]/70">{net.noFailures}</p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-[#8a4a5a]/20 bg-[#8a4a5a]/[0.04] px-3 py-2 text-xs text-[#8a4a5a]/90">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!isProcessing && !isQrPolling && step !== "importing") onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414] shadow-2xl shadow-black/30"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
              <div>
                <h2 className="text-base font-serif font-semibold text-[#ece8e1]">
                  {net.importTitle}
                </h2>
                <p className="text-xs text-[#9a948c] mt-0.5">
                  {step === "preview"
                    ? net.previewLoading
                    : step === "importing"
                    ? net.importing
                    : step === "done"
                    ? `${net.summaryFetched} ${summary?.fetched ?? 0}, ${net.summaryImported} ${summary?.imported ?? 0}`
                    : net.importDesc}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={isProcessing || isQrPolling || step === "importing"}
                className="p-1.5 rounded-md text-[#9a948c] hover:text-[#ece8e1] hover:bg-white/[0.04] transition-all disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Info box — only on auth step */}
              {step === "auth" && (
                <div className="rounded-lg border border-white/[0.04] bg-black/20 p-3 text-xs leading-relaxed text-[#9a948c] flex items-start gap-3">
                  <Info className="h-4 w-4 mt-0.5 text-[#c9a04a]/60 flex-shrink-0" />
                  <p>{net.configInfo}</p>
                </div>
              )}

              {renderBody()}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.04] bg-black/10">
              {step === "preview" && (
                <>
                  <button
                    onClick={() => setStep("auth")}
                    disabled={isProcessing}
                    className="px-4 py-1.5 text-[11px] font-medium text-[#9a948c] hover:text-[#ece8e1] hover:bg-white/[0.04] transition-all rounded-lg disabled:opacity-40"
                  >
                    {net.backToAuth}
                  </button>
                  <button
                    onClick={() => void handleImport()}
                    disabled={selectedAlbumKeys.length === 0 || isProcessing}
                    className="flex items-center gap-2 rounded-lg bg-[#c9a04a] px-4 py-1.5 text-[11px] font-medium text-[#0c0c0c] hover:bg-[#c9a04a]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {net.importSelected.replace("{count}", String(selectedAlbumKeys.length))}
                  </button>
                </>
              )}

              {step === "auth" && (
                <>
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 text-[11px] font-medium text-[#9a948c] hover:text-[#ece8e1] hover:bg-white/[0.04] transition-all rounded-lg"
                  >
                    {net.closeButton}
                  </button>
                  {authType !== "qr" && (
                    <button
                      onClick={() => void handlePreview()}
                      disabled={
                        isProcessing ||
                        (authType === "phone" && (!phone.trim() || !password.trim())) ||
                        (authType === "cookie" && !buildCookieString())
                      }
                      className="flex items-center gap-2 rounded-lg bg-[#c9a04a] px-4 py-1.5 text-[11px] font-medium text-[#0c0c0c] hover:bg-[#c9a04a]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                      {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>
                        {isProcessing
                          ? net.previewLoading
                          : needCaptcha
                          ? net.verifyButton
                          : net.previewButton}
                      </span>
                    </button>
                  )}
                </>
              )}

              {step === "done" && (
                <button
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  className="px-4 py-1.5 text-[11px] font-medium text-[#9a948c] hover:text-[#ece8e1] hover:bg-white/[0.04] transition-all rounded-lg"
                >
                  {net.closeButton}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
