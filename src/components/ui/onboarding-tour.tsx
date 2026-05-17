"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Map, Calendar, Heart, Search, X } from "lucide-react";

type OnboardingTourProps = {
  isOpen: boolean;
  onClose: () => void;
};

const TOUR_STEPS = [
  {
    id: "map",
    title: "漫游乐图",
    description: "拖拽和缩放世界地图，在不同国家和城市之间探索随机掉落的精选专辑。地图就是你的音乐发现池。",
    icon: Map,
    bgAccent: "bg-[var(--accent-amber)]/8",
    borderAccent: "border-[var(--accent-amber)]/15",
    iconColor: "text-[var(--accent-amber)]/70",
    animation: (
      <div className="relative w-full h-36 bg-black/30 rounded-lg border border-white/[0.04] overflow-hidden flex items-center justify-center">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            x: [0, -15, 15, 0],
            y: [0, 8, -8, 0]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 opacity-10"
            style={{
            backgroundImage: 'radial-gradient(circle at center, var(--accent-amber) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 w-14 h-14 rounded-full border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/5 flex items-center justify-center"
        >
          <Map className="w-7 h-7 text-[var(--accent-amber)]/60" />
        </motion.div>

        <motion.div
          animate={{ scale: [0, 1, 0], opacity: [0, 0.5, 0] }}
          transition={{ duration: 4, repeat: Infinity, delay: 1.5 }}
          className="absolute right-1/4 top-1/4 w-6 h-6 rounded-full border border-[var(--accent-amber)]/20"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]/30 mx-auto mt-1.5" />
        </motion.div>
      </div>
    )
  },
  {
    id: "timeline",
    title: "穿越时间轴",
    description: "通过底部的时间滑块，自由筛选特定年代的音乐。看着不同时期的流派在世界版图上此起彼伏。",
    icon: Calendar,
    bgAccent: "bg-[var(--bg-roast)]/6",
    borderAccent: "border-[var(--edge-soft)]/14",
    iconColor: "text-[var(--text-dim)]/70",
    animation: (
      <div className="relative w-full h-36 bg-black/30 rounded-lg border border-white/[0.04] overflow-hidden flex items-center justify-center px-8">
        <div className="w-full h-1.5 bg-white/[0.04] rounded-full relative">
          <motion.div
            animate={{ left: ["10%", "40%"], right: ["90%", "20%"] }}
            transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            className="absolute top-0 bottom-0 bg-gradient-to-r from-[#5a7a8a]/60 to-[var(--accent-amber)]/60 rounded-full"
          />
          <motion.div
            animate={{ left: ["10%", "40%"] }}
            transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 bg-[var(--color-text)] rounded-full shadow-sm border border-[#5a7a8a]/30"
          />
          <motion.div
            animate={{ left: ["90%", "80%"] }}
            transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 bg-[var(--color-text)] rounded-full shadow-sm border border-[var(--edge-soft)]/30"
          />
        </div>
        <motion.div
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, repeatType: "reverse" }}
          className="absolute top-7 text-xs font-mono tracking-wider text-[#9a948c]"
        >
          1980 — 1999
        </motion.div>
      </div>
    )
  },
  {
    id: "mark",
    title: "标记与珍藏",
    description: "遇到熟悉的或是喜爱的专辑，一键标记「听过」或「收藏」。你的历史记录会以特殊的绿色坐标永远定格在地图上。",
    icon: Heart,
    bgAccent: "bg-[var(--accent-ember)]/8",
    borderAccent: "border-[var(--accent-ember)]/15",
    iconColor: "text-[var(--accent-ember)]/70",
    animation: (
      <div className="relative w-full h-36 bg-black/30 rounded-lg border border-white/[0.04] overflow-hidden flex items-center justify-center gap-8">
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex flex-col items-center gap-2 p-3 rounded-lg bg-[#4a8a6a]/8 border border-[#4a8a6a]/15"
        >
          <div className="w-9 h-9 rounded-full bg-[#4a8a6a]/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a8a6a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span className="text-xs font-medium text-[#4a8a6a]/70">已听过</span>
        </motion.div>

        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="flex flex-col items-center gap-2 p-3 rounded-lg bg-[#8a4a5a]/8 border border-[#8a4a5a]/15"
        >
          <div className="w-9 h-9 rounded-full bg-[#8a4a5a]/20 flex items-center justify-center">
            <Heart fill="#8a4a5a" stroke="#8a4a5a" className="w-4 h-4" />
          </div>
          <span className="text-xs font-medium text-[#8a4a5a]/70">已收藏</span>
        </motion.div>
      </div>
    )
  },
  {
    id: "search",
    title: "快速检索",
    description: "寻找特定的艺人或专辑？按下搜索，本地库与第三方曲库无缝结合，帮你定位世界上任何角落的音乐。",
    icon: Search,
    bgAccent: "bg-[var(--bg-roast)]/8",
    borderAccent: "border-[var(--edge-bronze)]/15",
    iconColor: "text-[var(--text-dim)]/70",
    animation: (
      <div className="relative w-full h-36 bg-black/30 rounded-lg border border-white/[0.04] overflow-hidden flex flex-col items-center justify-center px-6">
        <motion.div
          className="w-full max-w-[180px] h-9 rounded-full bg-black/40 border border-white/[0.06] flex items-center px-3 gap-2"
          animate={{ borderColor: ["rgba(255,255,255,0.06)", "rgba(201,160,74,0.2)", "rgba(255,255,255,0.06)"] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          <Search className="w-3.5 h-3.5 text-[#9a948c]" />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "60%" }}
            transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
            className="h-3 border-r border-[var(--edge-bronze)]/30 overflow-hidden whitespace-nowrap text-[10px] text-[var(--text-dim)] flex items-center"
          >
            Pink Floyd…
          </motion.div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -8] }}
          transition={{ duration: 3.5, repeat: Infinity }}
          className="mt-3 w-full max-w-[180px] h-10 bg-white/[0.02] border border-white/[0.04] rounded-lg flex items-center px-2 gap-2"
        >
          <div className="w-7 h-7 rounded bg-white/[0.04]" />
          <div className="flex-1 space-y-1">
            <div className="h-1.5 w-full bg-white/[0.04] rounded-full" />
            <div className="h-1.5 w-2/3 bg-white/[0.02] rounded-full" />
          </div>
        </motion.div>
      </div>
    )
  }
];

export function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const stepInfo = TOUR_STEPS[currentStep];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 16, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className={`relative w-full max-w-md rounded-xl border border-[var(--edge-soft)] bg-[var(--bg-secondary)] shadow-2xl shadow-black/30 overflow-hidden`}
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 p-1 rounded-md bg-black/20 text-[var(--text-dim)] hover:bg-black/40 hover:text-[var(--text-cream)] transition-all"
            >
              <X size="14" />
            </button>

            <div className="p-8">
              {/* Animation Frame */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                  transition={{ duration: 0.25 }}
                  className="mb-6"
                >
                  {stepInfo.animation}
                </motion.div>
              </AnimatePresence>

              {/* Text Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25 }}
                  className="text-center"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <stepInfo.icon className={`w-5 h-5 ${stepInfo.iconColor}`} />
                    <h2 className={`text-lg font-serif font-semibold text-[var(--color-text)] tracking-tight`}>
                      {stepInfo.title}
                    </h2>
                  </div>
                  <p className="text-xs text-[var(--text-dim)] leading-relaxed max-w-[85%] mx-auto">
                    {stepInfo.description}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Controls */}
              <div className="mt-6 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {TOUR_STEPS.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        idx === currentStep ? "w-5 bg-[var(--accent-amber)]/60" : "w-1 bg-white/[0.08]"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] text-[#9a948c] hover:text-[var(--color-text)] hover:bg-white/[0.04] transition-all"
                    >
                      <ChevronLeft size="16" />
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 font-medium text-sm bg-[var(--accent-amber)] text-[var(--color-background)] hover:bg-[var(--accent-amber)]/90 transition-all active:scale-[0.97]"
                  >
                    {currentStep === TOUR_STEPS.length - 1 ? "开始探索" : "下一步"}
                    {currentStep < TOUR_STEPS.length - 1 && <ChevronRight size="15" />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
