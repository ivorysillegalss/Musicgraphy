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
    title: "漫游音乐地理",
    description: "拖拽和缩放世界地图，在不同国家和城市之间探索随机掉落的精选专辑。地图就是你的音乐发现池。",
    icon: Map,
    color: "from-blue-400 to-cyan-400",
    shadow: "shadow-cyan-500/20",
    animation: (
      <div className="relative w-full h-40 bg-zinc-950/50 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center">
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, -20, 20, 0],
            y: [0, 10, -10, 0]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle at center, #22d3ee 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
        />
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center backdrop-blur-md"
        >
          <Map className="w-8 h-8 text-cyan-300" />
        </motion.div>
        
        <motion.div
          animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: 1 }}
          className="absolute right-1/4 top-1/4 w-8 h-8 rounded-full bg-blue-500/30 border border-blue-400/50 flex items-center justify-center"
        >
          <div className="w-2 h-2 rounded-full bg-blue-300" />
        </motion.div>
      </div>
    )
  },
  {
    id: "timeline",
    title: "穿越时间轴",
    description: "通过底部的时间滑块，自由筛选特定年代的音乐。看着不同时期的流派在世界版图上此起彼伏。",
    icon: Calendar,
    color: "from-emerald-400 to-teal-400",
    shadow: "shadow-emerald-500/20",
    animation: (
      <div className="relative w-full h-40 bg-zinc-950/50 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center px-8">
        <div className="w-full h-2 bg-zinc-800 rounded-full relative">
          <motion.div 
            animate={{ left: ["10%", "40%"], right: ["90%", "20%"] }}
            transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            className="absolute top-0 bottom-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
          />
          <motion.div
            animate={{ left: ["10%", "40%"] }}
            transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-emerald-500"
          />
          <motion.div
            animate={{ left: ["90%", "80%"] }} // right equivalent
            transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-teal-500"
          />
        </div>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, repeatType: "reverse" }}
          className="absolute top-6 text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400"
        >
          1980 - 1999
        </motion.div>
      </div>
    )
  },
  {
    id: "mark",
    title: "标记与珍藏",
    description: "遇到熟悉的或是喜爱的专辑，一键标记“听过”或“收藏”。你的历史记录会以特殊的绿色坐标永远定格在地图上。",
    icon: Heart,
    color: "from-pink-400 to-rose-400",
    shadow: "shadow-pink-500/20",
    animation: (
      <div className="relative w-full h-40 bg-zinc-950/50 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center gap-6">
         <motion.div
            whileHover={{ scale: 1.1 }}
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
         >
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.4)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <span className="text-xs font-medium text-emerald-400">已听过</span>
         </motion.div>
         
         <motion.div
            whileHover={{ scale: 1.1 }}
            animate={{ y: [0, 5, 0] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-pink-500/10 border border-pink-500/20"
         >
            <div className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center shadow-[0_0_15px_rgba(236,72,153,0.4)]">
              <Heart fill="white" stroke="white" className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-pink-400">已收藏</span>
         </motion.div>
      </div>
    )
  },
  {
    id: "search",
    title: "快速检索",
    description: "寻找特定的艺人或专辑？按下搜索，本地库与第三方曲库无缝结合，帮你定位世界上任何角落的音乐。",
    icon: Search,
    color: "from-indigo-400 to-purple-400",
    shadow: "shadow-indigo-500/20",
    animation: (
      <div className="relative w-full h-40 bg-zinc-950/50 rounded-xl border border-white/10 overflow-hidden flex flex-col items-center justify-center px-6">
        <motion.div 
          className="w-full max-w-[200px] h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center px-3 gap-2"
          animate={{ borderColor: ["#3f3f46", "#8b5cf6", "#3f3f46"] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Search className="w-4 h-4 text-zinc-400" />
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: "60%" }}
            transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
            className="h-4 border-r-2 border-purple-400 overflow-hidden whitespace-nowrap text-xs text-zinc-300 font-mono flex items-center"
          >
            Pink Floyd...
          </motion.div>
        </motion.div>
        <motion.div 
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
           transition={{ duration: 3, repeat: Infinity }}
           className="mt-4 w-full max-w-[180px] h-12 bg-white/5 border border-white/10 rounded-lg flex items-center px-2 gap-3"
        >
          <div className="w-8 h-8 rounded bg-purple-500/20" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-full bg-zinc-700 rounded" />
            <div className="h-2 w-2/3 bg-zinc-800 rounded" />
          </div>
        </motion.div>
      </div>
    )
  }
];

export function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Reset step when opened
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
           className="fixed inset-0 z-[100] grid place-items-center bg-black/80 backdrop-blur-md p-4"
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`relative w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden ${stepInfo.shadow}`}
          >
            {/* Top Pattern */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-50" style={{ background: `linear-gradient(to right, transparent, currentColor, transparent)`}} />

            <button 
              onClick={onClose}
              className="absolute right-4 top-4 z-10 rounded-full bg-black/20 p-1.5 text-zinc-400 hover:bg-black/40 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

            <div className="p-8">
              {/* Image / Animation Frame */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                  transition={{ duration: 0.3 }}
                  className="mb-8"
                >
                  {stepInfo.animation}
                </motion.div>
              </AnimatePresence>

              {/* Text Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="text-center min-h-[100px]"
                >
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <stepInfo.icon className={`w-6 h-6 text-transparent bg-clip-text bg-gradient-to-r ${stepInfo.color}`} />
                    <h2 className={`text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${stepInfo.color}`}>
                      {stepInfo.title}
                    </h2>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed max-w-[85%] mx-auto">
                    {stepInfo.description}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Controls */}
              <div className="mt-8 flex items-center justify-between">
                <div className="flex gap-2">
                  {TOUR_STEPS.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === currentStep ? "w-6 bg-white" : "w-1.5 bg-white/20"
                      }`} 
                    />
                  ))}
                </div>

                <div className="flex gap-3">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className={`flex h-10 items-center justify-center gap-2 rounded-full px-5 font-semibold text-black transition-all hover:scale-105 bg-gradient-to-r ${stepInfo.color}`}
                  >
                    {currentStep === TOUR_STEPS.length - 1 ? "开始探索" : "下一步"}
                    {currentStep < TOUR_STEPS.length - 1 && <ChevronRight size={16} />}
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