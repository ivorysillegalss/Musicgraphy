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
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5 backdrop-blur">
              <div>
                <h2 className="text-lg font-semibold text-white">MusicBrainz Tokens</h2>
                <p className="text-xs text-zinc-400">粘贴 1-8 个用户 MB tokens，用换行或逗号分隔。</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-white/5 bg-black/30 p-4 text-sm text-zinc-300 flex items-start gap-3">
                <Info className="h-4 w-4 mt-0.5 text-amber-300" />
                <div className="space-y-1">
                  <p>直接使用 MB Web Service 时，每个 token 绑定到用户，并有速率限制。</p>
                  <p>这里保存的 token 只用于你的搜索；未提供时会回退匿名/全局 token。</p>
                </div>
              </div>

              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-100">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs leading-5">可直接通过 MusicBrainz OAuth 绑定，自动获取并续期 access token。</p>
                  <button
                    onClick={() => {
                      if (onConnectOAuth) {
                        void onConnectOAuth();
                      }
                    }}
                    disabled={!oauthEnabled || isConnectingOAuth}
                    className="rounded-full bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isConnectingOAuth ? "连接中..." : "连接 OAuth"}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">MB tokens（每行或逗号分隔）</label>
                <textarea
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600 resize-none"
                  placeholder="tokenA\ntokenB\ntokenC"
                />
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>已填 {tokens.length} 个，最多 8 个。</span>
                  <span>输入会在保存时自动清洗与截断。</span>
                </div>
              </div>

              {message && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    message.tone === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {message.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-zinc-950/60">
              <button
                onClick={onClose}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                disabled={isSaving}
              >
                取消
              </button>
              <button
                onClick={() => void onSave()}
                disabled={isSaving || isConnectingOAuth}
                className="flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-indigo-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>保存</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
