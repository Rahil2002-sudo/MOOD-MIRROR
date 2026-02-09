import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { 
  CloudSun, TrendingUp, Mic, Info, BrainCircuit, Leaf, Wind, Sparkles, 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Moon, Star, Share2, LogOut, Cloud, Loader2, AlertCircle, X, Bell
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';

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

// Initialize services safely
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

// --- THEME CONSTANTS ---
const MOOD_THEMES = {
  joy: { 
    glass: 'bg-emerald-400/20', 
    solid: '#34d399',
    accent: 'text-emerald-700', 
    bg: 'from-emerald-100 to-teal-50', 
    blob: 'bg-emerald-300', 
    glow: 'shadow-[0_0_35px_rgba(16,185,129,0.5)]', 
    text: 'Growth & Joy', 
    icon: <Leaf className="w-full h-full" /> 
  },
  anxiety: { 
    glass: 'bg-amber-400/20', 
    solid: '#fbbf24',
    accent: 'text-amber-700', 
    bg: 'from-orange-50 to-amber-100', 
    blob: 'bg-amber-300', 
    glow: 'shadow-[0_0_35px_rgba(245,158,11,0.5)]', 
    text: 'Restless', 
    icon: <Wind className="w-full h-full" /> 
  },
  stress: { 
    glass: 'bg-rose-400/20', 
    solid: '#fb7185',
    accent: 'text-rose-700', 
    bg: 'from-rose-50 to-slate-100', 
    blob: 'bg-rose-300', 
    glow: 'shadow-[0_0_35px_rgba(225,29,72,0.5)]', 
    text: 'High Intensity', 
    icon: <Sparkles className="w-full h-full" /> 
  },
  calm: { 
    glass: 'bg-sky-400/20', 
    solid: '#38bdf8',
    accent: 'text-sky-700', 
    bg: 'from-sky-100 to-indigo-50', 
    blob: 'bg-sky-300', 
    glow: 'shadow-[0_0_35px_rgba(14,165,233,0.5)]', 
    text: 'Deep Peace', 
    icon: <CloudSun className="w-full h-full" /> 
  },
  low: { 
    glass: 'bg-indigo-400/20', 
    solid: '#818cf8',
    accent: 'text-indigo-800', 
    bg: 'from-slate-200 to-indigo-100', 
    blob: 'bg-indigo-300', 
    glow: 'shadow-[0_0_35px_rgba(99,102,241,0.5)]', 
    text: 'Stillness', 
    icon: <Moon className="w-full h-full" /> 
  }
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
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [currentMood, setCurrentMood] = useState('calm');
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [calendarData, setCalendarData] = useState({});
  const [weeklyReport, setWeeklyReport] = useState(null);
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

  // --- LOGIC: PROBABILITY CALCULATION FOR DAILY AURA ---
  const getDominantMoodOfDay = useCallback((dayData) => {
    if (!dayData) return null;
    const moods = [dayData.q1, dayData.q2, dayData.q3, dayData.q4].filter(Boolean);
    if (moods.length === 0) return null;
    
    const freq = moods.reduce((acc, m) => { acc[m] = (acc[m] || 0) + 1; return acc; }, {});
    // If a mood appears 3+ times (75% probability), it overrides as the dominant aura
    const probabilityWinner = Object.keys(freq).find(k => freq[k] >= 3);
    if (probabilityWinner) return probabilityWinner;

    // Otherwise, standard highest frequency
    return Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
  }, []);

  // Sync Logic
  useEffect(() => {
    if (!auth) return;
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

  // Fetch all user days for the calendar view
  useEffect(() => {
    if (!user || !db) return;
    const colRef = collection(db, 'artifacts', appId, 'users', user.uid, 'days');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const data = {};
      snapshot.forEach(docSnap => { data[docSnap.id] = docSnap.data(); });
      setCalendarData(data);
    }, (err) => console.error(err));
    return () => unsubscribe();
  }, [user]);

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

  // --- WEEKLY ANALYSIS ENGINE (Gemini) ---
  const generateWeeklyAlert = async () => {
    if (!user || isGenerating) return;
    setIsGenerating(true);
    
    // Aggregate last 7 days of dominant moods
    const last7 = [];
    for(let i=0; i<7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const mood = getDominantMoodOfDay(calendarData[getDateKey(d)]);
      if(mood) last7.push(mood);
    }

    if (last7.length < 3) {
      setWeeklyReport({ message: "Mirrors require 3 cycles of depth to project your weekly mental horizon.", alert: false, status: "Analyzing Trend" });
      setIsGenerating(false);
      return;
    }

    const prompt = `Act as a clinical innovator. Analyze this 7-day mood sequence: ${last7.join(', ')}. 
    If you see 3+ days of stress or anxiety, provide a 'Vulnerability Alert'. If mostly joy/calm, provide a 'Stability Affirmation'. 
    Respond strictly in JSON: {"message": "Poetic 2-sentence summary", "status": "Stable/Vulnerable", "alert": true/false}`;

    try {
      const finalKey = geminiApiKey || "";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${finalKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      const result = await response.json();
      setWeeklyReport(JSON.parse(result.candidates[0].content.parts[0].text));
    } catch (e) { console.error(e); } finally { setIsGenerating(false); }
  };

  // Calendar Engine Grid
  const calendarDays = useMemo(() => {
    const days = [];
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Pad first week
    const startPadding = firstDay.getDay();
    for (let i = 0; i < startPadding; i++) days.push({ empty: true, key: `empty-${i}` });

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), i);
      const key = getDateKey(d);
      days.push({ 
        day: i, 
        key, 
        mood: getDominantMoodOfDay(calendarData[key]),
        isToday: key === getDateKey(new Date())
      });
    }
    return days;
  }, [calendarData, getDateKey, getDominantMoodOfDay]);

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

  const generateSummary = async () => {
    if (!user || isGenerating) return;
    const dateKey = getDateKey(selectedDate);
    const dayData = calendarData[dateKey];
    if (!dayData) return;
    setIsGenerating(true);
    const moods = Object.entries(dayData).filter(([k]) => k.startsWith('q')).map(([k, v]) => `${k}: ${v}`).join(', ');
    const prompt = `Analyze: ${moods}. 2-sentence poetic summary. JSON: {"message": "..."}`;
    try {
      const finalKey = geminiApiKey || "";
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
      
      {/* Top Right Calendar Toggle */}
      <button 
        onClick={() => { setIsCalendarOpen(true); generateWeeklyAlert(); }}
        className="fixed top-6 right-6 z-[100] p-4 rounded-full backdrop-blur-xl bg-white/30 border border-white/40 shadow-lg text-slate-800 hover:scale-110 active:scale-95 transition-transform"
      >
        <CalendarIcon size={24} />
      </button>

      {/* Sync Status Badge */}
      <div className="fixed bottom-4 right-4 z-[100] group">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border text-[9px] font-black uppercase tracking-widest transition-all ${user ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-rose-500/10 border-rose-500/30 text-rose-500'}`}>
          <Cloud size={12} className={!user ? 'animate-pulse' : ''} />
          {user ? 'Cloud Synced' : authError ? 'Config Error' : 'Syncing...'}
        </div>
      </div>

      <header className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-center mb-8 md:mb-12 z-20 gap-4">
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
              
              {/* Mirror Area - Draggable Container */}
              <div ref={constraintsRef} className="z-10 relative backdrop-blur-2xl bg-white/30 p-6 md:p-10 rounded-[2.5rem] md:rounded-[4rem] border border-white/40 shadow-xl flex flex-col items-center gap-8 md:gap-12 min-h-[400px] md:min-h-[500px] overflow-hidden">
                <div className="text-center z-20">
                  <h2 className="text-lg md:text-2xl font-bold text-slate-800 mb-1" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Fluid Release</h2>
                  <p className="text-xs md:text-sm text-slate-500 italic">Drag to release tension. Tap palette to log.</p>
                </div>
                
                <div className="relative flex-1 flex items-center justify-center w-full min-h-[200px] pointer-events-none">
                  <motion.div 
                    drag dragConstraints={constraintsRef} dragElastic={0.6} style={{ x, y, rotateX, rotateY }} 
                    onDragEnd={() => { x.set(0); y.set(0); }}
                    className={`pointer-events-auto z-30 w-36 h-36 md:w-56 md:h-56 shadow-2xl backdrop-blur-3xl transition-colors duration-1000 ${activeTheme.glass} ${activeTheme.glow} border border-white/60 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-full p-8`}
                  >
                    <div className={`${activeTheme.accent} w-12 h-12 md:w-20 md:h-20`}>{activeTheme.icon}</div>
                  </motion.div>
                </div>

                {/* Palette */}
                <div className="grid grid-cols-5 gap-3 md:gap-6 w-full max-w-lg z-20">
                  {Object.entries(MOOD_THEMES).map(([key, theme]) => (
                    <button 
                      key={key} 
                      onClick={() => setCurrentMood(key)} 
                      className={`group flex flex-col items-center gap-2 p-1.5 rounded-3xl transition-all ${currentMood === key ? `bg-white/60 ${theme.glow} scale-110 shadow-lg` : 'hover:bg-white/20'}`}
                    >
                      <div 
                        className={`w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white flex items-center justify-center p-2.5 transition-all`}
                        style={{ backgroundColor: theme.solid }}
                      >
                        <div className="text-white w-full h-full">{theme.icon}</div>
                      </div>
                      <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-slate-500" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{key}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Temporal Pulse Calendar */}
              <div className="relative z-[60] backdrop-blur-xl bg-white/40 p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] border border-white/60 shadow-lg flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <CalendarIcon size={18} className="text-slate-700" />
                    <h3 className="text-md md:text-lg font-bold text-slate-800 uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Temporal Pulse</h3>
                  </div>
                  <div className="flex items-center gap-2 bg-white/60 px-4 py-1.5 rounded-full border border-white/80 text-[9px] md:text-[10px] font-black shadow-sm">
                    <button onClick={() => changeDate(-1)} className="hover:text-slate-400 transition-colors"><ChevronLeft size={14} /></button>
                    <span className="w-24 md:w-28 text-center">{selectedDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
                    <button onClick={() => changeDate(1)} className="hover:text-slate-400 transition-colors"><ChevronRight size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  {TIME_SLOTS.map((slot) => {
                    const moodId = calendarData[getDateKey(selectedDate)]?.[slot.id];
                    const moodTheme = moodId ? MOOD_THEMES[moodId] : null;
                    return (
                      <button 
                        key={slot.id} 
                        type="button"
                        onClick={() => handleSlotClick(slot.id)} 
                        className={`pointer-events-auto relative p-4 rounded-[1.8rem] md:rounded-[2.2rem] border transition-all flex flex-col items-center gap-2 min-h-[90px] md:min-h-[110px] 
                          ${moodId ? `${moodTheme.glass} border-white/80 ${moodTheme.glow}` : 'bg-white/10 border-white/20 hover:bg-white/40'}`}
                      >
                        <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-slate-400">{slot.period}</span>
                        <div className="h-8 md:h-10 flex items-center justify-center pointer-events-none">
                          {moodId ? (
                            <div className={`${moodTheme.accent} w-6 h-6 md:w-8 md:h-8`}>{moodTheme.icon}</div>
                          ) : (
                             <div className="w-6 h-6 md:w-8 md:h-8 border-2 border-dashed border-slate-300 rounded-full opacity-30" />
                          )}
                        </div>
                        <span className="text-[8px] md:text-[9px] text-slate-400 font-bold tracking-tighter uppercase pointer-events-none">{slot.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Voice Journal */}
              <div className="relative z-20 backdrop-blur-xl bg-white/20 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/30 flex flex-col sm:flex-row items-center justify-between shadow-sm gap-4">
                <div className="flex gap-4 md:gap-6 items-center">
                  <div className="p-4 md:p-5 rounded-full bg-white/40 text-slate-600"><Mic size={24} /></div>
                  <h3 className="text-lg md:text-xl font-bold text-slate-800 tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Voice Journal</h3>
                </div>
                <button className="w-full sm:w-auto px-8 md:px-12 py-3 md:py-4 rounded-full font-black tracking-[0.2em] text-[10px] bg-slate-800 text-white hover:bg-slate-700 transition-all uppercase shadow-lg">Record vibe</button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8 pb-12">
              <div className="backdrop-blur-3xl bg-slate-800/95 text-white p-8 md:p-16 rounded-[2.5rem] md:rounded-[4rem] border border-white/10 shadow-2xl text-center flex flex-col items-center">
                {!currentSummary ? (
                  <div className="flex flex-col items-center gap-8">
                    <Star className="text-amber-400 fill-amber-400" size={40} />
                    <p className="text-lg md:text-2xl italic opacity-60 font-light leading-relaxed max-w-md">Log your temporal pulse to generate a poetic synthesis of your day.</p>
                    <button 
                      onClick={generateSummary} 
                      disabled={isGenerating} 
                      className="px-10 py-5 bg-white text-slate-900 rounded-full font-black text-[11px] tracking-[0.3em] uppercase shadow-2xl disabled:opacity-50 hover:scale-105 transition-transform"
                      style={{ fontFamily: "'Cinzel Decorative', serif" }}
                    >
                      {isGenerating ? <Loader2 className="animate-spin" size={20} /> : 'Generate Synthesis'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-10">
                    <Star className="text-amber-400 fill-amber-400" size={24} />
                    <p className="text-xl md:text-4xl italic leading-tight max-w-3xl font-medium text-slate-100">
                      "{currentSummary.message}"
                    </p>
                    <button 
                      onClick={() => generateSummary()}
                      className="text-[10px] font-black tracking-widest uppercase text-white/30 hover:text-white transition-colors"
                      style={{ fontFamily: "'Cinzel Decorative', serif" }}
                    >
                      Regenerate Reflection
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FULL SCREEN CALENDAR MODAL */}
      <AnimatePresence>
        {isCalendarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-slate-100/95 backdrop-blur-3xl flex items-center justify-center p-4 md:p-10 overflow-y-auto">
            <div className="w-full max-w-4xl flex flex-col gap-8 text-slate-800">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl md:text-4xl font-black uppercase tracking-[0.3em]" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Mirror Horizon</h2>
                <button onClick={() => setIsCalendarOpen(false)} className="p-3 bg-slate-200 rounded-full hover:bg-slate-300 transition-colors"><X size={28} /></button>
              </div>

              {/* Weekly Mental Health Alert */}
              <div className={`p-8 rounded-[3rem] border transition-all duration-1000 ${weeklyReport?.alert ? 'bg-rose-500/10 border-rose-500/30' : 'bg-white border-slate-200 shadow-xl'}`}>
                <div className="flex flex-col md:flex-row gap-6 items-center text-center md:text-left">
                   <div className={`p-5 rounded-[1.5rem] ${weeklyReport?.alert ? 'bg-rose-500 shadow-lg shadow-rose-500/20' : 'bg-emerald-500 shadow-lg shadow-emerald-500/20'} text-white`}>
                     {isGenerating ? <Loader2 className="animate-spin" size={32} /> : (weeklyReport?.alert ? <Bell size={32} /> : <Sparkles size={32} />)}
                   </div>
                   <div className="flex-1">
                     <h3 className="text-xl font-black uppercase mb-1 tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{isGenerating ? 'Consulting Internal Rhythms...' : (weeklyReport?.status || 'Analyzing Trend')}</h3>
                     <p className="text-slate-600 italic text-sm md:text-base leading-relaxed">{weeklyReport?.message || "Synthesizing your temporal sequences across the horizon..."}</p>
                   </div>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="bg-white p-6 md:p-10 rounded-[3rem] border border-slate-200 shadow-2xl">
                <div className="grid grid-cols-7 gap-2 md:gap-4 mb-8">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => <div key={i} className="text-center text-[10px] font-black text-slate-400 uppercase" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{d[0]}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-2 md:gap-4">
                  {calendarDays.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      {!item.empty ? (
                        <div className={`w-full aspect-square rounded-[1rem] md:rounded-[1.5rem] border flex flex-col items-center justify-center relative transition-all duration-1000
                          ${item.mood ? `${MOOD_THEMES[item.mood].glass} border-white shadow-sm ${MOOD_THEMES[item.mood].glow}` : 'bg-slate-50 border-slate-100'}
                          ${item.isToday ? 'ring-2 ring-indigo-500 shadow-lg' : ''}`}
                        >
                          {item.mood && (
                            <div className={`${MOOD_THEMES[item.mood].accent} w-5 h-5 md:w-7 md:h-7 mb-1`}>{MOOD_THEMES[item.mood].icon}</div>
                          )}
                          <span className={`text-[9px] md:text-[11px] font-black ${item.mood ? 'text-slate-800' : 'text-slate-300'}`}>
                            {item.day}
                          </span>
                        </div>
                      ) : <div className="w-full aspect-square" />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Closed Daily @ 01:00 AM • Neural Sync Active</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
