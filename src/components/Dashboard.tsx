import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { UserProfile, Workout } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Play, CheckCircle2, Activity, Dumbbell, Clock, ChevronRight, History, Trophy } from 'lucide-react';
import { format, isToday, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion } from 'motion/react';

interface DashboardProps {
  user: UserProfile;
  onStartWorkout: (workout: Workout) => void;
}

export default function Dashboard({ user, onStartWorkout }: DashboardProps) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'workouts'),
      where('clientId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const workoutData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Workout[];
      setWorkouts(workoutData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const todayWorkout = workouts.find(w => w.date && isToday(w.date.toDate()) && w.status === 'planned');
  const pastWorkouts = workouts.filter(w => w.status === 'completed' || w.status === 'auto-completed');
  const upcomingWorkouts = workouts.filter(w => {
    if (!w.date || w.status !== 'planned') return false;
    const d = w.date.toDate();
    return isAfter(d, new Date()) && !isToday(d);
  }).sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());

  const startWorkout = async (workout: Workout) => {
    await updateDoc(doc(db, 'workouts', workout.id), {
      status: 'in-progress',
      startTime: Timestamp.now()
    });
    onStartWorkout(workout);
  };

  if (loading) return <div className="flex justify-center p-12"><Activity className="animate-spin text-emerald-600" /></div>;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-blue-900">Bonjour, {user.firstName} ! 👋</h1>
        <p className="text-slate-500">Prêt pour votre séance d'aujourd'hui ?</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Today's Workout & Profile */}
        <div className="lg:col-span-2 space-y-8">
          {/* Today's Workout */}
          <Card className="border-none shadow-xl bg-gradient-to-br from-blue-900 to-blue-800 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Dumbbell size={120} />
            </div>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none mb-2">SÉANCE DU JOUR</Badge>
                  <CardTitle className="text-2xl">{todayWorkout ? todayWorkout.name : "Repos aujourd'hui"}</CardTitle>
                </div>
                <Calendar size={24} className="text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {todayWorkout ? (
                <>
                  <p className="text-blue-100">Votre coach a préparé une séance sur mesure pour atteindre vos objectifs.</p>
                  <Button 
                    onClick={() => startWorkout(todayWorkout)}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-14 text-lg font-bold rounded-xl shadow-lg shadow-emerald-900/20"
                  >
                    <Play className="mr-2 fill-current" /> DÉMARRER L'ENTRAÎNEMENT
                  </Button>
                </>
              ) : (
                <div className="py-4 text-blue-200 italic">
                  Aucun entraînement prévu pour aujourd'hui. Profitez-en pour bien récupérer !
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats / Objectives */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-none shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Trophy size={16} className="text-emerald-500" /> Objectif Principal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-blue-900">{user.primaryObjective || "Non défini"}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Activity size={16} className="text-blue-500" /> Condition Physique
                </CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <div>
                  <p className="text-xs text-slate-400">Poids</p>
                  <p className="text-lg font-bold text-blue-900">{user.currentWeight || user.initialWeight || '--'} kg</p>
                </div>
                <div className="w-px bg-slate-100 h-10"></div>
                <div>
                  <p className="text-xs text-slate-400">Taille</p>
                  <p className="text-lg font-bold text-blue-900">{user.height} cm</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Upcoming + History */}
        <div className="space-y-6">
          {/* Upcoming Workouts */}
          {upcomingWorkouts.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-blue-900 flex items-center gap-2">
                  <Calendar size={20} className="text-blue-500" /> Prochaines séances
                </h2>
              </div>
              <div className="space-y-3">
                {upcomingWorkouts.map((workout, idx) => (
                  <motion.div
                    key={workout.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-50 text-blue-600 p-2 rounded-lg">
                            <Dumbbell size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-blue-900">{workout.name}</p>
                            <p className="text-xs text-slate-400">
                              {format(workout.date.toDate(), 'EEEE d MMMM', { locale: fr })}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {/* History */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-blue-900 flex items-center gap-2">
              <History size={20} className="text-emerald-500" /> Historique
            </h2>
          </div>
          
          <div className="space-y-4">
            {pastWorkouts.length > 0 ? (
              pastWorkouts.map((workout, idx) => (
                <motion.div 
                  key={workout.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Card className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${workout.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-blue-900 group-hover:text-emerald-600 transition-colors">{workout.name}</p>
                          <p className="text-xs text-slate-400">
                            {workout.date ? format(workout.date.toDate(), 'd MMMM yyyy', { locale: fr }) : 'Date inconnue'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 italic">Aucun entraînement terminé pour le moment.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
