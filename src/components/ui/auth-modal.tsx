"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { X, Mail, Lock, Loader2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: (email: string, pass: string) => Promise<void>;
  onSignUp: (email: string, pass: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  message: string | null;
}

export function AuthModal({ isOpen, onClose, onSignIn, onSignUp, isLoading, error, message }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      await onSignIn(email, password);
    } else {
      await onSignUp(email, password);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className="w-full max-w-sm overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--bg-secondary)] shadow-2xl shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
              <h2 className="text-base font-serif font-semibold text-[var(--color-text)]">
                {isLogin ? "Sign In" : "Create Account"}
              </h2>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-[#9a948c] hover:text-[var(--color-text)] hover:bg-white/[0.04] transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c] tracking-wide">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9a948c]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-9 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--accent-green)]/30 transition-all placeholder:text-[#9a948c]"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#9a948c] tracking-wide">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9a948c]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg bg-black/30 border border-white/[0.06] px-9 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--accent-green)]/30 transition-all placeholder:text-[#9a948c]"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-[#8a4a5a]/10 border border-[#8a4a5a]/20 text-[11px] text-[#8a4a5a]/90">
                  {error}
                </div>
              )}
              {message && (
                <div className="p-3 rounded-lg bg-[#4a8a6a]/10 border border-[#4a8a6a]/20 text-[11px] text-[#4a8a6a]/90">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 rounded-lg bg-[var(--accent-green)] hover:bg-[var(--accent-green)]/90 text-[var(--color-background)] font-medium text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isLogin ? "Sign In" : "Sign Up")}
              </button>
            </form>

            <div className="px-6 py-4 bg-black/20 text-center border-t border-white/[0.04]">
              <p className="text-[11px] text-[#9a948c]">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="font-medium text-[var(--accent-green)]/80 hover:text-[var(--accent-green)] transition-colors"
                >
                  {isLogin ? "Sign Up" : "Log In"}
                </button>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
