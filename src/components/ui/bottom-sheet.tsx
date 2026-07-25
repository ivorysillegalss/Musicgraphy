"use client";

import React from "react";
import { motion } from "framer-motion";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute left-0 right-0 bottom-0 bg-[var(--bg-elevated)] rounded-t-2xl p-4 max-h-[80vh] overflow-auto"
          >
            <div className="w-full flex items-center justify-center">
              <div className="w-14 h-1.5 rounded-full bg-white/8 mb-3" />
            </div>
            {children}
          </motion.div>
        </div>
      ) : null}
    </>
  );
}

export default BottomSheet;
