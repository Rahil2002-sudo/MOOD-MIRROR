import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { 
  CloudSun, TrendingUp, Mic, Info, BrainCircuit, Leaf, Wind, Sparkles, 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Moon, Star, Share2, LogOut, Cloud, Loader2, AlertCircle
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, where, limit } from 'firebase/firestore';

// --- ROBUST CONFIGURATION LOGIC ---
const getFirebaseConfig = () => {
  // Check Canvas Environment
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return JSON.parse(__firebase_config); } catch (e) { return null; }
  }
  
  // Check Vite/Vercel Environment safely
  try {
    // We use a string-based check to prevent bundler errors
    // @ts-ignore
    const viteConfig = import.meta.env?.VITE_FIREBASE_CONFIG;
    if (viteConfig) return JSON.parse(viteConfig);
  } catch (e) {
    // Fallback for older browsers or non-Vite environments
  }

  return null;
};

const config = getFirebaseConfig();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'mood-mirror-app';
const apiKey = ""; // System provides this at runtime

// Initialize services only if config exists to prevent immediate crash
let auth, db;
if (config && config.apiKey) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
}

// --- THEME CONSTANTS ---
const MOOD_THEMES = {
  joy: { glass: 'bg-emerald-400/20', accent: 'text-emerald-700', bg: 'from-emerald-100 to-teal-50', blob: 'bg-emerald-300', glow: 'shadow-[0_0_35px_rgba(16,185,129,0.5)]', text: 'Growth & Joy', icon: <Leaf className="w-8 h-8" /> },
  anxiety: { glass: 'bg-amber-400/20', accent: 'text-amber-700', bg: 'from-orange-50 to-amber-100', blob: 'bg-amber-300', glow: 'shadow-[0_0_35px_rgba(245,158,11,0.5)]', text: 'Restless', icon: <Wind className="w-8 h-8" /> },
  stress: { glass: 'bg-rose-400/20', accent: 'text-rose-700', bg: 'from-rose-50 to-slate-100', blob: 'bg-rose-300', glow: 'shadow-[0_0_35px_rgba(225,29,72,0.5)]', text: 'High Intensity', icon: <Sparkles className="w-8 h-8" /> },
  calm: { glass: 'bg-sky-400/20', accent: 'text-sky-700', bg: 'from-sky-100 to-indigo-50', blob: 'bg-sky-300', glow: 'shadow-[0_0_35px_rgba(14,165,233,0.5)]', text: 'Deep Peace', icon: <CloudSun className="w-8 h-8" /> },
  low: { glass: 'bg-indigo-400/20', accent: 'text-indigo-800', bg: 'from-slate-200 to-indigo-100', blob: 'bg-indigo-300', glow: 'shadow-[0_0_35px_rgba(99,102,241,0.5)]', text: 'Stillness', icon: <Sparkles className="w-8 h-8" /> }
};

const TIME_SLOTS = [
  { id: 'q1', label: '12 AM - 6 AM', period: 'Night', range: [0, 5] },
  { id: 'q2', label: '6 AM - 12 PM', period: 'Morning', range: [6, 11] },
  { id: 'q3', label: '12 PM - 6 PM', period: 'Afternoon', range: [12, 17] },
  { id: 'q4', label: '6 PM - 12 AM', period: 'Evening', range: [18, 23] }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [view, setView] = useState('checkin');
  const [currentMood, setCurrentMood] = useState('calm');
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [calendarData, setCalendarData] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);

  const constraintsRef = useRef(null);
  const activeTheme = MOOD_THEMES[currentMood];

  // Logic to determine current time quadrant
  const currentHour = new Date().getHours();
  const currentSlotId = TIME_SLOTS.find(slot => 
    currentHour >= slot.range[0] && currentHour <= slot.range[1]
  )?.id;

  // --- AUTHENTICATION ---
  useEffect(() => {
    if (!auth) {
      setIsAuthLoading(false);
      return;
    }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        console.error("Auth error:", err); 
      } finally {
        setIsAuthLoading(false);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // --- DATA SYNC ---
  useEffect(() => {
    if (!user || !db) return;
    const dateKey = getDateKey(selectedDate);
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'days', dateKey);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setCalendarData(prev => ({ ...prev, [dateKey]: docSnap.data() }));
      } else {
        setCalendarData(prev => ({ ...prev, [dateKey]: {} }));
      }
    }, (err) => console.error("Firestore error:", err));

    return () => unsubscribe();
  }, [user, selectedDate]);

  // --- ERROR SCREEN FOR MISSING CONFIG ---
  if (!config) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8 text-center">
        <div className="max-w-md backdrop-blur-xl bg-white/5 p-10 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col items-center gap-6">
          <AlertCircle className="text-rose-500 w-16 h-16" />
          <h1 className="text-white text-2xl font-black uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Mirror Missing</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Your Vercel environment variables are missing or incorrect. Please ensure <code className="text-emerald-400">VITE_FIREBASE_CONFIG</code> is set in your Vercel Dashboard.
          </p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-white text-slate-900 rounded-full text-xs font-black uppercase tracking-widest">Retry Connection</button>
        </div>
      </div>
    );
  }

  // --- ACTIONS ---
  const handleSlotClick = async (slotId) => {
    if (!user || !db) return;
    const dateKey = getDateKey(selectedDate);
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'days', dateKey);
    try {
      await setDoc(docRef, { [slotId]: currentMood, updated_at: Date.now() }, { merge: true });
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  const getDateKey = (date) => date.toISOString().split('T')[0];
  const changeDate = (offset) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + offset);
    setSelectedDate(newDate);
  };

  const generateSummary = async () => {
    if (!user || isGenerating) return;
    const dateKey = getDateKey(selectedDate);
    const dayData = calendarData[dateKey];
    if (!dayData || Object.keys(dayData).length === 0) return;

    setIsGenerating(true);
    const moodsLogged = Object.entries(dayData)
      .filter(([key, val]) => key.startsWith('q') && val)
      .map(([key, val]) => `${key}: ${val}`)
      .join(', ');

    const prompt = `Analyze: ${moodsLogged}. Create poetic summary. JSON: {"message": "...", "dominant": "...", "energy": 85}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      const result = await response.json();
      const content = JSON.parse(result.candidates[0].content.parts[0].text);
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'days', dateKey);
      await setDoc(docRef, { ai_summary: content }, { merge: true });
    } catch (e) { console.error(e); } finally { setIsGenerating(false); }
  };

  const currentDaySummary = calendarData[getDateKey(selectedDate)]?.ai_summary;

  // --- MOTION ---
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 30 });
  const springY = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(springY, [-100, 100], [15, -15]);
  const rotateY = useTransform(springX, [-100, 100], [-15, 15]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-slate-400" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Loading Mirror...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen w-full transition-colors duration-1000 bg-gradient-to-br ${activeTheme.bg} p-4 md:p-8 flex flex-col items-center overflow-x-hidden font-sans`}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&display=swap');`}</style>
      
      {/* Cloud Status */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border text-[10px] font-bold tracking-widest uppercase ${user ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-rose-500/10 border-rose-500/30 text-rose-600 animate-pulse'}`}>
          <Cloud size={12} />
          {user ? 'Cloud Synced' : 'Syncing...'}
        </div>
      </div>

      <header className="w-full max-w-5xl flex justify-between items-center mb-12 z-10">
        <div className="flex flex-col">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-widest text-slate-800" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Mood Mirror</h1>
          <div className="h-1 w-24 bg-slate-800 rounded-full mt-1 opacity-20" />
        </div>
        <nav className="flex gap-2 backdrop-blur-xl bg-white/20 p-1.5 rounded-full border border-white/30 shadow-sm">
          <button onClick={() => setView('checkin')} className={`px-5 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest ${view === 'checkin' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:bg-white/30'}`} style={{ fontFamily: "'Cinzel Decorative', serif" }}>Reflect</button>
          <button onClick={() => setView('dashboard')} className={`px-5 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest ${view === 'dashboard' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:bg-white/30'}`} style={{ fontFamily: "'Cinzel Decorative', serif" }}>Insights</button>
        </nav>
      </header>

      <main className="w-full max-w-5xl z-10">
        <AnimatePresence mode="wait">
          {view === 'checkin' ? (
            <motion.div key="checkin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">
              
              <div ref={constraintsRef} className="backdrop-blur-2xl bg-white/30 p-8 md:p-12 rounded-[3.5rem] border border-white/40 shadow-xl flex flex-col items-center gap-10 min-h-[500px] relative overflow-hidden">
                <div className="text-center z-10 pointer-events-none">
                  <h2 className="text-2xl font-bold text-slate-800 mb-1" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Fluid Release</h2>
                  <p className="text-sm text-slate-500 italic">Drag to release. Tap palette to log a quadrant.</p>
                </div>
                
                <div className="relative flex-1 flex items-center justify-center w-full min-h-[250px]">
                  <motion.div 
                    drag dragConstraints={constraintsRef} dragElastic={0.6} 
                    style={{ x, y, rotateX, rotateY }} 
                    onDragEnd={() => { x.set(0); y.set(0); }}
                    className={`z-20 w-48 h-48 md:w-56 md:h-56 shadow-2xl backdrop-blur-3xl transition-colors duration-1000 ${activeTheme.glass} ${activeTheme.glow} border border-white/60 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-full`}
                  >
                    <div className={activeTheme.accent}>{activeTheme.icon}</div>
                  </motion.div>
                </div>

                <div className="grid grid-cols-5 gap-3 md:gap-6 w-full max-w-lg z-10">
                  {Object.entries(MOOD_THEMES).map(([key, theme]) => (
                    <button key={key} onClick={() => setCurrentMood(key)} className={`group flex flex-col items-center gap-2 p-2 rounded-2xl transition-all ${currentMood === key ? `bg-white/60 ${theme.glow} scale-110` : 'hover:bg-white/20'}`}>
                      <div className={`w-8 h-8 rounded-full border-2 border-white ${theme.glass.replace('/20', '')}`} />
                      <span className="text-[7px] font-black uppercase tracking-widest text-slate-500" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{key}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/30 p-8 rounded-[3rem] border border-white/40 shadow-sm flex flex-col gap-6">
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <CalendarIcon size={20} className="text-slate-700" />
                    <h3 className="text-lg font-bold text-slate-800 uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Temporal Pulse</h3>
                  </div>
                  <div className="flex items-center gap-2 bg-white/40 px-3 py-1.5 rounded-full border border-white/50 text-[10px] font-black">
                    <ChevronLeft size={16} className="cursor-pointer" onClick={() => changeDate(-1)} />
                    <span className="w-28 text-center" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{selectedDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
                    <ChevronRight size={16} className="cursor-pointer" onClick={() => changeDate(1)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {TIME_SLOTS.map((slot) => {
                    const moodAtSlot = calendarData[getDateKey(selectedDate)]?.[slot.id];
                    const slotTheme = moodAtSlot ? MOOD_THEMES[moodAtSlot] : null;
                    const isToday = getDateKey(selectedDate) === getDateKey(new Date());
                    const isCurrentSlot = isToday && slot.id === currentSlotId;

                    return (
                      <button 
                        key={slot.id} 
                        onClick={() => handleSlotClick(slot.id)} 
                        className={`p-4 rounded-[2rem] border transition-all flex flex-col items-center gap-2 ${moodAtSlot ? `${slotTheme.glass} border-white/50 ${slotTheme.glow}` : 'bg-white/10 border-white/20 hover:bg-white/30'} ${isCurrentSlot ? 'ring-2 ring-slate-800/20 shadow-lg' : ''}`}
                      >
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{slot.period}</span>
                        <div className="h-8 flex items-center justify-center">
                          {moodAtSlot && <div className={slotTheme.accent}>{slotTheme.icon}</div>}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium italic">{slot.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-8">
              <div className="backdrop-blur-3xl bg-slate-800/95 text-white p-10 rounded-[4rem] border border-white/10 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
                <Moon className="absolute -top-10 -right-10 w-48 h-48 opacity-5 text-white" />
                {!currentDaySummary ? (
                  <div className="py-12 flex flex-col items-center gap-6 z-10">
                    <Star className="text-amber-400 fill-amber-400" size={32} />
                    <h3 className="text-2xl font-black uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Daily Synthesis</h3>
                    <button 
                      onClick={generateSummary}
                      disabled={isGenerating || Object.keys(calendarData[getDateKey(selectedDate)] || {}).length < 1}
                      className="mt-4 px-10 py-4 bg-white text-slate-900 rounded-full font-black uppercase tracking-[0.2em] text-[10px] shadow-xl disabled:opacity-20 flex items-center gap-2"
                      style={{ fontFamily: "'Cinzel Decorative', serif" }}
                    >
                      {isGenerating && <Loader2 className="animate-spin" size={14} />}
                      {isGenerating ? 'Synthesizing...' : 'Generate Reflection'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-8 z-10 w-full">
                    <p className="text-xl md:text-3xl font-medium italic leading-relaxed text-slate-100">"{currentDaySummary.message}"</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col items-center">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Dominant Tone</span>
                        <span className="text-xl font-black uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{currentDaySummary.dominant}</span>
                      </div>
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col items-center">
                        <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest mb-2">Daily Vitality</span>
                        <span className="text-2xl font-black">{currentDaySummary.energy}%</span>
                      </div>
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col items-center col-span-2 md:col-span-1">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Mindset</span>
                        <span className="text-xl font-black uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Harmonious</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto py-12 flex gap-8 opacity-20">
         <button onClick={() => signOut(auth)} className="text-[10px] font-bold uppercase tracking-widest">Logout</button>
      </footer>
    </div>
  );
}
