import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { 
  CloudSun, TrendingUp, Mic, Info, BrainCircuit, Leaf, Wind, Sparkles, 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Moon, Star, Share2, LogOut
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, where } from 'firebase/firestore';

// --- CONFIGURATION & INITIALIZATION ---
// This looks for keys in your .env file
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const appId = 'mood-mirror-prod';
const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 

// Initialize Firebase only if config is present
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
  const [view, setView] = useState('checkin');
  const [currentMood, setCurrentMood] = useState('calm');
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [calendarData, setCalendarData] = useState({});
  const [aiSummary, setAiSummary] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const constraintsRef = useRef(null);
  const activeTheme = MOOD_THEMES[currentMood];

  // --- AUTHENTICATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) { console.error("Auth error:", err); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // --- DATA SYNC ---
  useEffect(() => {
    if (!user) return;
    const dateKey = getDateKey(selectedDate);
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'days', dateKey);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setCalendarData(prev => ({ ...prev, [dateKey]: docSnap.data() }));
        if (docSnap.data().ai_summary) setAiSummary(docSnap.data().ai_summary);
      } else {
        setAiSummary(null);
      }
    }, (err) => console.error("Firestore error:", err));

    return () => unsubscribe();
  }, [user, selectedDate]);

  // --- AI LOGIC (GEMINI) ---
  const generateAiSynthesis = async () => {
    if (!user || isGenerating) return;
    const dateKey = getDateKey(selectedDate);
    const dayData = calendarData[dateKey];
    if (!dayData) return;

    setIsGenerating(true);
    const moods = Object.values(dayData).filter(m => typeof m === 'string');
    const prompt = `Act as a poetic therapist. Analyze these moods from a user's day: ${moods.join(', ')}. 
    Provide a short, 2-sentence empathetic summary and three stats: 1. Dominant Frequency (mood name), 2. Internal Consistency (0-100%), 3. Mindset (one word). 
    Respond in valid JSON format: {"message": "...", "dominant": "...", "consistency": 85, "mindset": "..."}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const result = await response.json();
      
      // Safety check for parsing
      let contentText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      // Clean code blocks if present
      contentText = contentText.replace(/```json/g, '').replace(/```/g, '');
      const content = JSON.parse(contentText);
      
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'days', dateKey);
      await setDoc(docRef, { ai_summary: content }, { merge: true });
    } catch (err) {
      console.error("Gemini Error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- ACTIONS ---
  const handleSlotClick = async (slotId) => {
    if (!user) return;
    const dateKey = getDateKey(selectedDate);
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'days', dateKey);
    await setDoc(docRef, { [slotId]: currentMood, updated_at: Date.now() }, { merge: true });
  };

  const getDateKey = (date) => date.toISOString().split('T')[0];
  const changeDate = (offset) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + offset);
    setSelectedDate(newDate);
  };

  // --- MOTION & UI ---
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 30 });
  const springY = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(springY, [-100, 100], [15, -15]);
  const rotateY = useTransform(springX, [-100, 100], [-15, 15]);

  return (
    <div className={`min-h-screen w-full transition-colors duration-1000 bg-gradient-to-br ${activeTheme.bg} p-4 md:p-8 flex flex-col items-center overflow-x-hidden font-sans`}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&display=swap');`}</style>
      
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 15, repeat: Infinity }} className={`absolute top-0 left-0 w-96 h-96 blur-[100px] rounded-full ${activeTheme.blob}`} />
      </div>

      <header className="w-full max-w-5xl flex justify-between items-center mb-12 z-10">
        <div className="flex flex-col">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-widest text-slate-800" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Mood Mirror</h1>
          <p className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-40 ml-1">Self-Awareness Engine</p>
        </div>
        <nav className="flex gap-2 backdrop-blur-xl bg-white/20 p-1.5 rounded-full border border-white/30 shadow-sm">
          <button onClick={() => setView('checkin')} className={`px-5 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest ${view === 'checkin' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500'}`} style={{ fontFamily: "'Cinzel Decorative', serif" }}>Reflect</button>
          <button onClick={() => setView('dashboard')} className={`px-5 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest ${view === 'dashboard' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500'}`} style={{ fontFamily: "'Cinzel Decorative', serif" }}>Insights</button>
        </nav>
      </header>

      <main className="w-full max-w-5xl z-10">
        <AnimatePresence mode="wait">
          {view === 'checkin' ? (
            <motion.div key="checkin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-8">
              <div ref={constraintsRef} className="backdrop-blur-2xl bg-white/30 p-8 md:p-12 rounded-[3.5rem] border border-white/40 shadow-xl flex flex-col items-center gap-10 min-h-[500px] relative overflow-hidden">
                <div className="text-center z-10 pointer-events-none">
                  <h2 className="text-2xl font-bold text-slate-800 mb-1" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Fluid Release</h2>
                  <p className="text-sm text-slate-500 italic">Drag to ground. Tap below to shift hue.</p>
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
                  <div className="flex items-center gap-2 bg-white/40 px-4 py-1.5 rounded-full border border-white/50 text-[10px] font-black">
                    <ChevronLeft size={16} className="cursor-pointer" onClick={() => changeDate(-1)} />
                    <span className="w-28 text-center" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{selectedDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
                    <ChevronRight size={16} className="cursor-pointer" onClick={() => changeDate(1)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {TIME_SLOTS.map((slot) => {
                    const mood = calendarData[getDateKey(selectedDate)]?.[slot.id];
                    return (
                      <button key={slot.id} onClick={() => handleSlotClick(slot.id)} className={`p-4 rounded-[2rem] border transition-all flex flex-col items-center gap-2 ${mood ? `${MOOD_THEMES[mood].glass} border-white/50 ${MOOD_THEMES[mood].glow}` : 'bg-white/10 border-white/20'}`}>
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400" style={{ fontFamily: "'Cinzel Decorative', serif" }}>{slot.period}</span>
                        <div className="h-8 flex items-center justify-center">{mood && <div className={MOOD_THEMES[mood].accent}>{MOOD_THEMES[mood].icon}</div>}</div>
                        <span className="text-[10px] text-slate-500 font-medium italic">{slot.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8">
              <div className="backdrop-blur-3xl bg-slate-800/95 text-white p-8 md:p-12 rounded-[4rem] border border-white/10 shadow-2xl relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center text-center">
                <Moon className="absolute -top-10 -right-10 w-48 h-48 opacity-5 text-white" />
                {!aiSummary ? (
                  <div className="flex flex-col items-center gap-4">
                    <Star className="text-amber-400 animate-pulse" />
                    <h3 className="text-2xl font-black uppercase tracking-widest" style={{ fontFamily: "'Cinzel Decorative', serif" }}>Midnight Synthesis</h3>
                    <p className="text-slate-400 italic max-w-sm mb-6 uppercase text-xs tracking-widest">Log all 4 quadrants to generate your daily reflection.</p>
                    <button 
                      onClick={generateAiSynthesis}
                      disabled={isGenerating || Object.keys(calendarData[getDateKey(selectedDate)] || {}).length < 2}
                      className="px-8 py-3 bg-white text-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-30"
                      style={{ fontFamily: "'Cinzel Decorative', serif" }}
                    >
                      {isGenerating ? "Consulting Stars..." : "Generate Summary"}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-6">
                    <p className="text-xl md:text-3xl font-medium italic leading-relaxed text-slate-100">"{aiSummary.message}"</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full mt-8">
                      <div className="bg-white/5 p-4 rounded-3xl border border-white/10">
                        <span className="text-[9px] font-bold text-emerald-400 block mb-1">STABILITY</span>
                        <span className="text-lg font-black">{aiSummary.consistency}%</span>
                      </div>
                      <div className="bg-white/5 p-4 rounded-3xl border border-white/10">
                        <span className="text-[9px] font-bold text-sky-400 block mb-1">MINDSET</span>
                        <span className="text-lg font-black uppercase tracking-widest">{aiSummary.mindset}</span>
                      </div>
                      <div className="bg-white/5 p-4 rounded-3xl border border-white/10 col-span-2 md:col-span-1">
                        <span className="text-[9px] font-bold text-indigo-400 block mb-1">FREQUENCY</span>
                        <span className="text-lg font-black uppercase tracking-widest">{aiSummary.dominant}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto pt-20 pb-12 z-10 opacity-30 flex gap-8">
        <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-800"><LogOut size={14} /> Reset Session</button>
      </footer>
    </div>
  );
}