import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { UserProfile, Workout, WorkoutExercise, WeightEntry } from '../types';
import { analyzeProgress } from '../lib/gemini';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { BarChart3, TrendingUp, TrendingDown, Dumbbell, Calendar, Clock, Flame, Trophy, Target, Activity, Sparkles, Loader2, Brain, CheckCircle2, Star, Zap } from 'lucide-react';
import { format, differenceInDays, subDays, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { motion } from 'motion/react';

interface AnalyticsProps {
  user: UserProfile;
}

interface WorkoutWithExercises extends Workout {
  exercises: WorkoutExercise[];
}

export default function Analytics({ user }: AnalyticsProps) {
  const [workouts, setWorkouts] = useState<WorkoutWithExercises[]>([]);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    // Load workouts
    const qWorkouts = query(
      collection(db, 'workouts'),
      where('clientId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubWorkouts = onSnapshot(qWorkouts, async (snapshot) => {
      const workoutData: WorkoutWithExercises[] = [];
      for (const docSnap of snapshot.docs) {
        const workout = { id: docSnap.id, ...docSnap.data() } as Workout;
        // Load exercises for each workout
        const exSnap = await getDocs(collection(db, 'workouts', workout.id, 'exercises'));
        const exercises = exSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutExercise));
        workoutData.push({ ...workout, exercises });
      }
      setWorkouts(workoutData);
      setLoading(false);
    });

    // Load weight
    const qWeight = query(
      collection(db, 'weight_tracking'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubWeight = onSnapshot(qWeight, (snapshot) => {
      setWeightHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WeightEntry)));
    });

    return () => {
      unsubWorkouts();
      unsubWeight();
    };
  }, [user.uid]);

  // Computed stats
  const completedWorkouts = workouts.filter(w => w.status === 'completed' || w.status === 'auto-completed');
  const plannedWorkouts = workouts.filter(w => w.status === 'planned');
  const totalExercisesCompleted = completedWorkouts.reduce((sum, w) => sum + w.exercises.filter(e => e.completed).length, 0);

  // Completion rate
  const completionRate = workouts.length > 0 ? Math.round((completedWorkouts.length / workouts.length) * 100) : 0;

  // Streak calculation
  const calculateStreak = (): number => {
    if (completedWorkouts.length === 0) return 0;
    let streak = 0;
    const sortedDates = completedWorkouts
      .map(w => w.date?.toDate())
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime());

    if (sortedDates.length === 0) return 0;

    // Check if last workout was within the last 3 days
    const daysSinceLast = differenceInDays(new Date(), sortedDates[0]);
    if (daysSinceLast > 3) return 0;

    streak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const diff = differenceInDays(sortedDates[i - 1], sortedDates[i]);
      if (diff <= 3) streak++;
      else break;
    }
    return streak;
  };

  // Difficulty distribution
  const difficultyStats = (() => {
    const all = completedWorkouts.flatMap(w => w.exercises.filter(e => e.difficulty));
    const easy = all.filter(e => e.difficulty === 'too-easy').length;
    const perfect = all.filter(e => e.difficulty === 'just-right').length;
    const hard = all.filter(e => e.difficulty === 'too-hard').length;
    const total = easy + perfect + hard;
    return total > 0 ? [
      { name: 'Facile', value: easy, color: '#3B82F6' },
      { name: 'Parfait', value: perfect, color: '#10B981' },
      { name: 'Difficile', value: hard, color: '#F43F5E' },
    ] : [];
  })();

  // Most worked muscles
  const muscleStats = (() => {
    const muscles: Record<string, number> = {};
    completedWorkouts.forEach(w => {
      w.exercises.filter(e => e.completed && e.muscles).forEach(e => {
        (e.muscles || '').split(',').forEach(m => {
          const key = m.trim();
          if (key) muscles[key] = (muscles[key] || 0) + 1;
        });
      });
    });
    return Object.entries(muscles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  })();

  // Weekly workout count (last 8 weeks)
  const weeklyData = (() => {
    const weeks: { week: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = subDays(new Date(), (i + 1) * 7);
      const end = subDays(new Date(), i * 7);
      const count = completedWorkouts.filter(w => {
        const d = w.date?.toDate();
        return d && isAfter(d, start) && !isAfter(d, end);
      }).length;
      weeks.push({ week: `S-${i}`, count });
    }
    return weeks;
  })();

  // Weight chart data
  const weightChartData = [...weightHistory]
    .reverse()
    .map(entry => ({
      date: format(entry.date.toDate(), 'dd/MM'),
      weight: entry.weight
    }));

  // AI Analysis
  const handleAIAnalysis = async () => {
    setAiLoading(true);
    try {
      const workoutData = completedWorkouts.slice(0, 10).map(w => ({
        name: w.name,
        date: w.date ? format(w.date.toDate(), 'yyyy-MM-dd') : '',
        exercises: w.exercises.map(e => ({
          name: e.name,
          difficulty: e.difficulty,
          actualSets: e.actualSets,
          actualReps: e.actualReps,
          actualWeight: e.actualWeight,
        }))
      }));
      const weightData = weightHistory.slice(0, 20).map(w => ({
        date: format(w.date.toDate(), 'yyyy-MM-dd'),
        weight: w.weight
      }));

      const analysis = await analyzeProgress(workoutData, weightData, user.primaryObjective || 'Remise en forme');
      setAiAnalysis(analysis);
    } catch {
      setAiAnalysis("L'analyse IA n'est pas disponible pour le moment. Vérifiez votre clé API Gemini.");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Activity className="animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-blue-900 flex items-center gap-3">
            <BarChart3 className="text-emerald-500" /> Mes Statistiques
          </h1>
          <p className="text-slate-500">Suivez votre progression et vos performances.</p>
        </div>
        <Button
          onClick={handleAIAnalysis}
          disabled={aiLoading}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl"
        >
          {aiLoading ? <Loader2 className="mr-2 animate-spin" size={18} /> : <Brain className="mr-2" size={18} />}
          Analyse IA
        </Button>
      </div>

      {/* AI Analysis Card */}
      {aiAnalysis && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-none shadow-md bg-gradient-to-r from-violet-50 to-indigo-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles size={18} className="text-violet-600" /> Analyse IA de votre progression
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{aiAnalysis}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Séances complétées', value: completedWorkouts.length, icon: CheckCircle2, color: 'emerald', sub: `sur ${workouts.length} total` },
          { label: 'Taux de complétion', value: `${completionRate}%`, icon: Target, color: 'blue', sub: 'de vos séances' },
          { label: 'Exercices réalisés', value: totalExercisesCompleted, icon: Dumbbell, color: 'violet', sub: 'exercices au total' },
          { label: 'Série en cours', value: calculateStreak(), icon: Flame, color: 'amber', sub: 'séances consécutives' },
        ].map((kpi, idx) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
            <Card className="border-none shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{kpi.label}</p>
                    <p className="text-3xl font-bold text-blue-900 mt-1">{kpi.value}</p>
                    <p className="text-xs text-slate-400 mt-1">{kpi.sub}</p>
                  </div>
                  <div className={`bg-${kpi.color}-100 p-2 rounded-xl`}>
                    <kpi.icon size={24} className={`text-${kpi.color}-600`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity */}
        <Card className="border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
              <Calendar size={18} className="text-blue-500" /> Activité Hebdomadaire
            </CardTitle>
            <CardDescription>Nombre de séances par semaine (8 dernières)</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e3a8a' }}
                />
                <Bar dataKey="count" fill="#10B981" radius={[6, 6, 0, 0]} name="Séances" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Weight Evolution */}
        <Card className="border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
              <TrendingDown size={18} className="text-emerald-500" /> Évolution du Poids
            </CardTitle>
            <CardDescription>
              {weightHistory.length > 0 && user.targetWeight
                ? `Objectif: ${user.targetWeight} kg`
                : 'Ajoutez des pesées dans votre profil'}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            {weightChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Line type="monotone" dataKey="weight" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: '#fff' }} name="Poids (kg)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                <p className="text-sm">Pas assez de données. Ajoutez des pesées.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Difficulty + Muscles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Difficulty Distribution */}
        <Card className="border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
              <Zap size={18} className="text-amber-500" /> Difficulté Ressentie
            </CardTitle>
          </CardHeader>
          <CardContent>
            {difficultyStats.length > 0 ? (
              <div className="flex items-center gap-8">
                <div className="w-40 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={difficultyStats} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={4} dataKey="value">
                        {difficultyStats.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {difficultyStats.map(d => (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
                      <span className="text-sm font-medium text-slate-700">{d.name}</span>
                      <span className="text-sm text-slate-400">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">Complétez des séances pour voir la répartition.</p>
            )}
          </CardContent>
        </Card>

        {/* Most Worked Muscles */}
        <Card className="border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
              <Dumbbell size={18} className="text-violet-500" /> Muscles les Plus Travaillés
            </CardTitle>
          </CardHeader>
          <CardContent>
            {muscleStats.length > 0 ? (
              <div className="space-y-3">
                {muscleStats.map((muscle, idx) => {
                  const maxCount = muscleStats[0].count;
                  const pct = Math.round((muscle.count / maxCount) * 100);
                  return (
                    <div key={muscle.name} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700 w-32 truncate">{muscle.name}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ delay: idx * 0.1, duration: 0.5 }}
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-8 text-right">{muscle.count}x</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">Complétez des exercices pour voir la répartition.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Workouts */}
      {plannedWorkouts.length > 0 && (
        <Card className="border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
              <Calendar size={18} className="text-blue-500" /> Prochaines Séances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plannedWorkouts.slice(0, 6).map(w => (
                <div key={w.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <Dumbbell size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-900">{w.name}</p>
                    <p className="text-xs text-slate-400">
                      {w.date ? format(w.date.toDate(), 'EEEE d MMMM', { locale: fr }) : 'Date inconnue'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
