"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, Info } from "lucide-react";

type MbTokenModalProps = {
  isOpen: boolean;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onConnectOAuth?: () => Promise<void>;
  isSaving: boolean;
  isConnectingOAuth?: boolean;
  oauthEnabled?: boolean;
  message?: { text: string; tone: "success" | "error" } | null;
};

function splitTokens(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function MbTokenModal({
  isOpen,
  value,
  onChange,
  onClose,
  onSave,
  onConnectOAuth,
  isSaving,
  isConnectingOAuth,
  oauthEnabled,
  message,
}: MbTokenModalProps) {
  const tokens = splitTokens(value);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--bg-secondary)] shadow-2xl shadow-black/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
              <div>
                <h2 className="text-base font-serif font-semibold text-[var(--color-text)]">MusicBrainz Tokens</h2>
                <p className="text-xs text-[#9a948c] mt-0.5">Paste 1-8 user MB tokens, separated by newlines or commas.</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-[#9a948c] hover:text-[var(--color-text)] hover:bg-white/[0.04] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-white/[0.04] bg-black/20 p-4 text-sm flex items-start gap-3">
                <Info className="h-4 w-4 mt-0.5 text-[var(--accent-green)]/60 flex-shrink-0" />
                <div className="space-y-1 text-xs leading-relaxed text-[#9a948c]">
                  <p>Each token is tied to a user and has rate limits when using the MB Web Service.</p>
                  <p>Tokens saved here are only used for your searches; if not provided, the system will fall back to anonymous/global tokens.</p>
                </div>
              </div>

              <div className="rounded-lg border border-[#5a7a8a]/15 bg-[#5a7a8a]/[0.03] p-3.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[#9a948c] leading-relaxed">Connect via MusicBrainz OAuth to automatically obtain and renew an access token.</p>
                  <button
                    onClick={() => {
                      if (onConnectOAuth) {
                        void onConnectOAuth();
                      }
                    }}
                    disabled={!oauthEnabled || isConnectingOAuth}
                    className="rounded-lg bg-[#5a7a8a]/80 px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[#5a7a8a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                  >
                    {isConnectingOAuth ? "Connecting..." : "Connect OAuth"}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c]">MB Tokens (one per line or comma-separated)</label>
                <textarea
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--accent-green)]/30 transition-all placeholder:text-[#9a948c] resize-none"
                  placeholder={"tokenA\ntokenB\ntokenC"}
                />
                <div className="flex items-center justify-between text-[11px] text-[#9a948c]">
                  <span>{tokens.length} entered, max 8.</span>
                  <span>Input is cleaned and truncated on save.</span>
                </div>
              </div>

              {message && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    message.tone === "success"
                      ? "border-[#4a8a6a]/20 bg-[#4a8a6a]/[0.04] text-[#4a8a6a]/90"
                      : "border-[#8a4a5a]/20 bg-[#8a4a5a]/[0.04] text-[#8a4a5a]/90"
                  }`}
                >
                  {message.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.04] bg-black/10">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-[11px] font-medium text-[#9a948c] hover:text-[var(--color-text)] hover:bg-white/[0.04] transition-all rounded-lg"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={() => void onSave()}
                disabled={isSaving || isConnectingOAuth}
                className="flex items-center gap-2 rounded-lg bg-[var(--accent-green)] px-4 py-1.5 text-[11px] font-medium text-[var(--color-background)] hover:bg-[var(--accent-green)]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Save</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
