import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { 
  CloudSun, TrendingUp, Mic, Info, BrainCircuit, Leaf, Wind, Sparkles, 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Moon, Star, Share2, LogOut, Cloud, Loader2, AlertCircle
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot } from 'firebase/firestore';

// --- ROBUST CONFIGURATION LOGIC ---
const getEnvConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    return { firebase: JSON.parse(__firebase_config), gemini: "" };
  }
  
  try {
    // @ts-ignore
    const metaEnv = import.meta.env; 
    if (metaEnv && metaEnv.VITE_FIREBASE_CONFIG) {
      return {
        firebase: JSON.parse(metaEnv.VITE_FIREBASE_CONFIG),
        gemini: metaEnv.VITE_GEMINI_API_KEY || ""
      };
    }
  } catch (e) {}

  return { firebase: null, gemini: "" };
};

const { firebase: config, gemini: geminiApiKey } = getEnvConfig();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'mood-mirror-prod';
const apiKey = ""; // System provided

// Initialize services only if config exists
let auth = null, db = null;
if (config && config.apiKey) {
  try {
    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
}

const MOOD_THEMES = {
  joy: { glass: 'bg-emerald-400/20', accent: 'text-emerald-700', bg: 'from-emerald-100 to-teal-50', blob: 'bg-emerald-300', glow: 'shadow-[0_0_35px_rgba(16,185,129,0.5)]', text: 'Growth & Joy', icon: <Leaf className="w-6 h-6 md:w-8 md:h-8" /> },
  anxiety: { glass: 'bg-amber-400/20', accent: 'text-amber-700', bg: 'from-orange-50 to-amber-100', blob: 'bg-amber-300', glow: 'shadow-[0_0_35px_rgba(245,158,11,0.5)]', text: 'Restless', icon: <Wind className="w-6 h-6 md:w-8 md:h-8" /> },
  stress: { glass: 'bg-rose-400/20', accent: 'text-rose-700', bg: 'from-rose-50 to-slate-100', blob: 'bg-rose-300', glow: 'shadow-[0_0_35px_rgba(225,29,72,0.5)]', text: 'High Intensity', icon: <Sparkles className="w-6 h-6 md:w-8 md:h-8" /> },
  calm: { glass: 'bg-sky-400/20', accent: 'text-sky-700', bg: 'from-sky-100 to-indigo-50', blob: 'bg-sky-300', glow: 'shadow-[0_0_35px_rgba(14,165,233,0.5)]', text: 'Deep Peace', icon: <CloudSun className="w-6 h-6 md:w-8 md:h-8" /> },
  low: { glass: 'bg-indigo-400/20', accent: 'text-indigo-800', bg: 'from-slate-200 to-indigo-100', blob: 'bg-indigo-300', glow: 'shadow-[0_0_35px_rgba(99,102,241,0.5)]', text: 'Stillness', icon: <Sparkles className="w-6 h-6 md:w-8 md:h-8" /> }
};

const TIME_SLOTS = [
  { id: 'q1', label: '12 AM - 6 AM', period: 'Night', range: [0, 5] },
  { id: 'q2', label: '6 AM - 12 PM', period: 'Morning', range: [6, 11] },
  { id: 'q3', label: '12 PM - 6 PM', period: 'Afternoon', range: [12, 17] },
  { id: 'q4', label: '6 PM - 12 AM', period: 'Evening', range: [18, 23] }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [view, setView] = useState('checkin');
  const [currentMood, setCurrentMood] = useState('calm');
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [calendarData, setCalendarData] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);

  const constraintsRef = useRef(null);
  const activeTheme = MOOD_THEMES[currentMood];

  // Motion Values
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 30 });
  const springY = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(springY, [-100, 100], [15, -15]);
  const rotateY = useTransform(springX, [-100, 100], [-15, 15]);

  const currentHour = new Date().getHours();
  const currentSlotId = TIME_SLOTS.find(slot => currentHour >= slot.range[0] && currentHour <= slot.range[1])?.id;

  const getDateKey = useCallback((date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    if (!auth) {
      setAuthError("No config found");
      return;
    }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
        setAuthError(null);
      } catch (err) { 
        setAuthError(err.message);
        setTimeout(initAuth, 5000); 
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const dateKey = getDateKey(selectedDate);
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'days', dateKey);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) setCalendarData(prev => ({ ...prev, [dateKey]: docSnap.data() }));
    }, (err) => console.error(err));
    return () => unsubscribe();
  }, [user, selectedDate, getDateKey]);

  const handleSlotClick = useCallback(async (slotId) => {
    const dateKey = getDateKey(selectedDate);
    setCalendarData(prev => ({
      ...prev,
      [dateKey]: { ...(prev[dateKey] || {}), [slotId]: currentMood }
    }));

    if (user && db) {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'days', dateKey);
      try {
        await setDoc(docRef, { [slotId]: currentMood, updated_at: Date.now() }, { merge: true });
      } catch (e) { console.error("Save failed", e); }
    }
  }, [selectedDate, currentMood, user, getDateKey]);

  if (!config) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="max-w-md backdrop-blur-xl bg-white/5 p-10 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col items-center gap-6">
          <AlertCircle className="text-rose-500 w-16 h-16" />
          <h1 className="text-white text-2xl font-black uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Mirror Missing</h1>
          <p className="text-slate-400 text-sm">Add VITE_FIREBASE_CONFIG to Vercel Settings.</p>
        </div>
      </div>
    );
  }

  const changeDate = (offset) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + offset);
    setSelectedDate(newDate);
  };

  const formatDisplayDate = (date) => {
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  };

  const generateSummary = async () => {
    if (!user || isGenerating) return;
    const dateKey = getDateKey(selectedDate);
    const dayData = calendarData[dateKey];
    if (!dayData) return;
    setIsGenerating(true);
    const moods = Object.entries(dayData).filter(([k]) => k.startsWith('q')).map(([k, v]) => `${k}: ${v}`).join(', ');
    const prompt = `Analyze these daily moods: ${moods}. Provide a short poetic summary of exactly two sentences. Return only JSON: {"message": "Your summary here"}`;
    try {
      const finalKey = geminiApiKey || apiKey;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${finalKey}`, {
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

  const currentSummary = calendarData[getDateKey(selectedDate)]?.ai_summary;

  return (
    <div className={`min-h-screen w-full transition-colors duration-1000 bg-gradient-to-br ${activeTheme.bg} p-4 md:p-8 flex flex-col items-center overflow-x-hidden font-sans`}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&display=swap');`}</style>
      
      {/* Sync Status Badge */}
      <div className="fixed bottom-4 right-4 z-50 group">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border text-[9px] font-black uppercase tracking-widest transition-all ${user ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-rose-500/10 border-rose-500/30 text-rose-500'}`}>
          <Cloud size={12} className={!user ? 'animate-pulse' : ''} />
          {user ? 'Cloud Synced' : authError ? 'Config Error' : 'Syncing...'}
        </div>
      </div>

      <header className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-center mb-8 md:mb-12 z-10 gap-4">
        <div className="flex flex-col items-center md:items-start">
          <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-slate-800" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Mood Mirror</h1>
          <div className="h-1 w-16 md:w-24 bg-slate-800 rounded-full mt-1 opacity-20 hidden md:block" />
        </div>
        <nav className="flex gap-2 backdrop-blur-xl bg-white/20 p-1.5 rounded-full border border-white/30 shadow-sm">
          <button onClick={() => setView('checkin')} className={`px-4 md:px-6 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest ${view === 'checkin' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:bg-white/30'}`} style={{ fontFamily: "'Cinzel Decorative', serif" }}>Reflect</button>
          <button onClick={() => setView('dashboard')} className={`px-4 md:px-6 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest ${view === 'dashboard' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:bg-white/30'}`} style={{ fontFamily: "'Cinzel Decorative', serif" }}>Insights</button>
        </nav>
      </header>

      <main className="w-full max-w-5xl z-10">
        <AnimatePresence mode="wait">
          {view === 'checkin' ? (
            <motion.div key="checkin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6 md:gap-8 pb-12">
              
              {/* Mirror Area */}
              <div ref={constraintsRef} className="z-10 relative backdrop-blur-2xl bg-white/30 p-6 md:p-10 rounded-[2.5rem] md:rounded-[4rem] border border-white/40 shadow-xl flex flex-col items-center gap-8 md:gap-12 min-h-[400px] md:min-h-[500px] overflow-hidden">
                <div className="text-center z-20">
                  <h2 className="text-lg md:text-2xl font-bold text-slate-800 mb-1" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Fluid Release</h2>
                  <p className="text-xs md:text-sm text-slate-500 italic">Drag to release tension. Tap below to log.</p>
                </div>
                
                <div className="relative flex-1 flex items-center justify-center w-full min-h-[200px] md:min-h-[250px]">
                  <motion.div 
                    drag dragConstraints={constraintsRef} dragElastic={0.6} style={{ x, y, rotateX, rotateY }} 
                    onDragEnd={() => { x.set(0); y.set(0); }}
                    className={`z-30 w-40 h-40 md:w-56 md:h-56 shadow-2xl backdrop-blur-3xl transition-colors duration-1000 ${activeTheme.glass} ${activeTheme.glow} border border-white/60 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-full`}
                  >
                    <div className={activeTheme.accent}>{activeTheme.icon}</div>
                  </motion.div>
                </div>

                <div className="grid grid-cols-5 gap-2 md:gap-4 w-full max-w-lg z-20">
                  {Object.entries(MOOD_THEMES).map(([key, theme]) => (
                    <button key={key} onClick={() => setCurrentMood(key)} className={`group flex flex-col items-center gap-1 md:gap-2 p-1.5 md:p-2 rounded-2xl transition-all ${currentMood === key ? `bg-white/60 ${theme.glow} scale-110 shadow-lg` : 'hover:bg-white/20'}`}>
                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-white ${theme.glass.replace('/20', '')}`} />
                      <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-slate-500" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{key}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Temporal Pulse Calendar */}
              <div className="relative z-40 backdrop-blur-xl bg-white/30 p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] border border-white/40 shadow-sm flex flex-col gap-4 md:gap-6">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <CalendarIcon size={18} className="text-slate-700" />
                    <h3 className="text-md md:text-lg font-bold text-slate-800 uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Temporal Pulse</h3>
                  </div>
                  <div className="flex items-center gap-2 bg-white/40 px-3 md:px-4 py-1.5 rounded-full border border-white/50 text-[9px] md:text-[10px] font-black">
                    <ChevronLeft size={14} className="cursor-pointer" onClick={() => changeDate(-1)} />
                    <span className="w-24 md:w-28 text-center">{formatDisplayDate(selectedDate)}</span>
                    <ChevronRight size={14} className="cursor-pointer" onClick={() => changeDate(1)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  {TIME_SLOTS.map((slot) => {
                    const moodAtSlot = calendarData[getDateKey(selectedDate)]?.[slot.id];
                    const slotTheme = moodAtSlot ? MOOD_THEMES[moodAtSlot] : null;
                    return (
                      <button 
                        key={slot.id} 
                        onClick={() => handleSlotClick(slot.id)} 
                        className={`pointer-events-auto relative p-3 md:p-4 rounded-[1.5rem] md:rounded-[2rem] border transition-all flex flex-col items-center gap-1 md:gap-2 min-h-[80px] md:min-h-[100px] 
                          ${moodAtSlot ? `${slotTheme.glass} border-white/50 ${slotTheme.glow}` : 'bg-white/10 border-white/20 hover:bg-white/40'}`}
                      >
                        <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-slate-400">{slot.period}</span>
                        <div className="h-6 md:h-8 flex items-center justify-center pointer-events-none">
                          {moodAtSlot && <div className={slotTheme.accent}>{React.cloneElement(slotTheme.icon, { size: 16 })}</div>}
                        </div>
                        <span className="text-[8px] md:text-[10px] text-slate-500 font-medium italic pointer-events-none">{slot.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Voice Journal */}
              <div className="backdrop-blur-xl bg-white/20 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/30 flex flex-col sm:flex-row items-center justify-between shadow-sm gap-4">
                <div className="flex gap-4 md:gap-6 items-center">
                  <div className="p-4 md:p-5 rounded-full bg-white/40 text-slate-600"><Mic size={24} md:size={28} /></div>
                  <h3 className="text-lg md:text-xl font-bold text-slate-800" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Voice Journal</h3>
                </div>
                <button className="w-full sm:w-auto px-8 md:px-10 py-3 md:py-4 rounded-full font-black tracking-widest bg-slate-800 text-white hover:bg-slate-700 transition-colors" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Record</button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8">
              <div className="backdrop-blur-3xl bg-slate-800/95 text-white p-8 md:p-12 rounded-[2.5rem] md:rounded-[4rem] border border-white/10 shadow-2xl text-center flex flex-col items-center">
                {!currentSummary ? (
                  <div className="flex flex-col items-center gap-6">
                    <Star className="text-amber-400 fill-amber-400" size={32} />
                    <p className="text-lg md:text-xl italic opacity-50">Log your day to generate synthesis.</p>
                    <button onClick={generateSummary} disabled={isGenerating} className="px-8 md:px-10 py-3 md:py-4 bg-white text-slate-900 rounded-full font-black text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
                      {isGenerating ? <Loader2 className="animate-spin" size={16} /> : 'Generate Synthesis'}
                    </button>
                  </div>
                ) : (
                  <p className="text-lg md:text-3xl italic leading-relaxed max-w-2xl">
                    {typeof currentSummary.message === 'string' ? `"${currentSummary.message}"` : 'Synthesis complete. Reflect on your journey.'}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes blob-slow {
          0% { transform: rotate(0deg) scale(1); border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%; }
          33% { transform: rotate(120deg) scale(1.05); border-radius: 50% 50% 33% 67% / 55% 27% 73% 45%; }
          66% { transform: rotate(240deg) scale(0.95); border-radius: 33% 67% 58% 42% / 63% 30% 70% 37%; }
          100% { transform: rotate(360deg) scale(1); border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%; }
        }
        .animate-blob-slow { animation: blob-slow 20s infinite linear; }
      `}} />
    </div>
  );
}
