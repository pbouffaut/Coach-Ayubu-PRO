import React, { useState, useEffect } from 'react';
import { auth, db, hashPassword } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, updateDoc, Timestamp, getDocs } from 'firebase/firestore';
import { UserProfile, Workout } from './types';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Trophy, LogOut, User, Calendar, Play, CheckCircle2, ChevronRight, Activity, Dumbbell, Clock, BarChart3 } from 'lucide-react';
import CoachAdmin from './components/CoachAdmin';
import Dashboard from './components/Dashboard';
import WorkoutSession from './components/WorkoutSession';
import ClientProfile from './components/ClientProfile';
import Analytics from './components/Analytics';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [view, setView] = useState<'dashboard' | 'session' | 'coach' | 'profile' | 'analytics'>('dashboard');
  const [loginMode, setLoginMode] = useState<'google' | 'code'>('google');
  const [clientCode, setClientCode] = useState('');
  const [clientPassword, setClientPassword] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.isAnonymous) {
        // Anonymous auth is used for code login — don't process here
        setLoading(false);
        return;
      }
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile;
          // Auto-promote designated coach if still client
          if (userData.role === 'client' && firebaseUser.email === 'pbouffaut@industriousoffice.com') {
            await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'coach' });
            userData.role = 'coach';
          }
          setUser(userData);
          if (userData.role === 'coach') {
            setView('coach');
          }
        } else {
          // New user - first user or designated email becomes coach
          const isFirstOrDesignatedCoach = firebaseUser.email === 'pbouffaut@industriousoffice.com';
          const newUser: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: isFirstOrDesignatedCoach ? 'coach' : 'client',
            firstName: firebaseUser.displayName?.split(' ')[0] || 'Prénom',
            lastName: firebaseUser.displayName?.split(' ')[1] || 'Nom',
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
          setUser(newUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen for active workout
  useEffect(() => {
    if (!user || user.role !== 'client') return;

    const q = query(
      collection(db, 'workouts'),
      where('clientId', '==', user.uid),
      where('status', '==', 'in-progress')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const workout = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Workout;

        // Auto-stop logic (4 hours)
        if (workout.startTime) {
          const startTime = workout.startTime.toDate();
          const now = new Date();
          const diffHours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);

          if (diffHours >= 4) {
            updateDoc(doc(db, 'workouts', workout.id), {
              status: 'auto-completed',
              endTime: Timestamp.now()
            });
            toast.info("Entraînement terminé automatiquement après 4 heures.");
            setActiveWorkout(null);
            setView('dashboard');
          } else {
            setActiveWorkout(workout);
            setView('session');
          }
        }
      } else {
        setActiveWorkout(null);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      toast.error("Erreur de connexion");
    }
  };

  const handleCodeLogin = async () => {
    if (!clientCode || !clientPassword) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    try {
      // Sign in anonymously to get Firestore read access for the query
      let wasAnonymous = false;
      if (!auth.currentUser) {
        await signInAnonymously(auth);
        wasAnonymous = true;
      }

      const hashedPw = await hashPassword(clientPassword);
      const q = query(
        collection(db, 'users'),
        where('clientCode', '==', clientCode.toUpperCase()),
        where('passwordHash', '==', hashedPw)
      );

      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data() as UserProfile;
        setUser(userData);
        if (userData.role === 'coach') {
          setView('coach');
        } else {
          setView('dashboard');
        }
        toast.success(`Bienvenue ${userData.firstName} !`);
      } else {
        if (wasAnonymous) await signOut(auth);
        toast.error("Code ou mot de passe incorrect");
      }
    } catch (error) {
      console.error('Code login error:', error);
      // If anonymous auth fails or rules block, try without auth
      try {
        const hashedPw = await hashPassword(clientPassword);
        const q = query(
          collection(db, 'users'),
          where('clientCode', '==', clientCode.toUpperCase()),
          where('passwordHash', '==', hashedPw)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data() as UserProfile;
          setUser(userData);
          setView(userData.role === 'coach' ? 'coach' : 'dashboard');
          toast.success(`Bienvenue ${userData.firstName} !`);
        } else {
          toast.error("Code ou mot de passe incorrect");
        }
      } catch {
        toast.error("Erreur de connexion. Le login par code nécessite l'activation de l'authentification anonyme dans Firebase.");
      }
    }
  };

  const handleLogout = () => {
    if (auth.currentUser) {
      signOut(auth);
    }
    setUser(null);
    setView('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-blue-900 flex flex-col items-center justify-center p-4 text-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="flex justify-center">
            <div className="bg-emerald-600 p-4 rounded-2xl shadow-xl">
              <Trophy size={64} className="text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Coach Ayubu PRO</h1>
            <p className="text-blue-100 text-lg">Suivez vos entraînements et dépassez vos limites.</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 space-y-6">
            {loginMode === 'google' ? (
              <>
                <Button
                  onClick={handleLogin}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-lg rounded-xl transition-all hover:scale-[1.02]"
                >
                  Connexion avec Google
                </Button>
                <Button
                  variant="link"
                  onClick={() => setLoginMode('code')}
                  className="w-full text-blue-200 hover:text-white"
                >
                  Utiliser un code client
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2 text-left">
                  <label className="text-sm font-medium text-blue-200">Code Client</label>
                  <input
                    type="text"
                    value={clientCode}
                    onChange={e => setClientCode(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl h-12 px-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="EX: ABC123"
                  />
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-sm font-medium text-blue-200">Mot de passe</label>
                  <input
                    type="password"
                    value={clientPassword}
                    onChange={e => setClientPassword(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl h-12 px-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="••••••••"
                  />
                </div>
                <Button
                  onClick={handleCodeLogin}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-lg rounded-xl transition-all hover:scale-[1.02]"
                >
                  Se connecter
                </Button>
                <Button
                  variant="link"
                  onClick={() => setLoginMode('google')}
                  className="w-full text-blue-200 hover:text-white"
                >
                  Retour à la connexion Google
                </Button>
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/20"></span></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-blue-900 px-2 text-blue-200">Aide</span></div>
            </div>
            <p className="text-sm text-blue-200">
              {loginMode === 'google'
                ? "Utilisez votre compte Google pour vous identifier. Si vous êtes un coach, vous aurez accès à l'interface de gestion."
                : "Entrez le code et le mot de passe fournis par votre coach."}
            </p>
          </div>
        </motion.div>
        <Toaster position="top-center" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView(user.role === 'coach' ? 'coach' : 'dashboard')}>
            <Trophy className="text-emerald-400" size={28} />
            <span className="font-bold text-xl tracking-tight">COACH<span className="text-emerald-400">AYUBU</span></span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 mr-4">
              {user.role === 'client' && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setView('dashboard')}
                    className={`text-sm font-medium ${view === 'dashboard' ? 'text-emerald-400' : 'text-blue-200'}`}
                  >
                    Dashboard
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setView('analytics')}
                    className={`text-sm font-medium ${view === 'analytics' ? 'text-emerald-400' : 'text-blue-200'}`}
                  >
                    Statistiques
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setView('profile')}
                    className={`text-sm font-medium ${view === 'profile' ? 'text-emerald-400' : 'text-blue-200'}`}
                  >
                    Mon Profil
                  </Button>
                </>
              )}
            </div>
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium">{user.firstName} {user.lastName}</span>
              <span className="text-[10px] uppercase tracking-wider text-blue-300">{user.role === 'coach' ? 'Coach Sportif' : 'Athlète'}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-blue-200 hover:text-white hover:bg-white/10">
              <LogOut size={20} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        <AnimatePresence mode="wait">
          {view === 'coach' && user.role === 'coach' && (
            <motion.div key="coach" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <CoachAdmin user={user} />
            </motion.div>
          )}
          {view === 'dashboard' && user.role === 'client' && (
            <motion.div key="dashboard" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Dashboard user={user} onStartWorkout={(w) => { setActiveWorkout(w); setView('session'); }} />
            </motion.div>
          )}
          {view === 'session' && activeWorkout && (
            <motion.div key="session" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}>
              <WorkoutSession workout={activeWorkout} onComplete={() => setView('dashboard')} />
            </motion.div>
          )}
          {view === 'profile' && user.role === 'client' && (
            <motion.div key="profile" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <ClientProfile user={user} />
            </motion.div>
          )}
          {view === 'analytics' && user.role === 'client' && (
            <motion.div key="analytics" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Analytics user={user} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Nav for Clients */}
      {user.role === 'client' && view !== 'session' && (
        <nav className="md:hidden bg-white border-t border-slate-200 h-16 flex items-center justify-around px-4 sticky bottom-0">
          <Button variant="ghost" className={`flex flex-col gap-1 h-auto ${view === 'dashboard' ? 'text-emerald-600' : 'text-slate-400'}`} onClick={() => setView('dashboard')}>
            <Activity size={20} />
            <span className="text-[10px]">Dashboard</span>
          </Button>
          <Button variant="ghost" className={`flex flex-col gap-1 h-auto ${view === 'analytics' ? 'text-emerald-600' : 'text-slate-400'}`} onClick={() => setView('analytics')}>
            <BarChart3 size={20} />
            <span className="text-[10px]">Stats</span>
          </Button>
          <Button variant="ghost" className={`flex flex-col gap-1 h-auto ${view === 'profile' ? 'text-emerald-600' : 'text-slate-400'}`} onClick={() => setView('profile')}>
            <User size={20} />
            <span className="text-[10px]">Profil</span>
          </Button>
        </nav>
      )}

      <Toaster position="top-center" richColors />
    </div>
  );
}
