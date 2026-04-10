import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { Workout, WorkoutExercise } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Separator } from './ui/separator';
import { Play, CheckCircle2, Clock, Dumbbell, Video, Info, Minus, Plus, ChevronLeft, Flag, Activity, Weight } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface WorkoutSessionProps {
  workout: Workout;
  onComplete: () => void;
}

export default function WorkoutSession({ workout, onComplete }: WorkoutSessionProps) {
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'workouts', workout.id, 'exercises'),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const exerciseData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkoutExercise[];
      setExercises(exerciseData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [workout.id]);

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      if (workout.startTime) {
        const start = workout.startTime.toDate();
        const now = new Date();
        const diff = now.getTime() - start.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setElapsedTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [workout.startTime]);

  const updateExercise = async (exerciseId: string, data: Partial<WorkoutExercise>) => {
    await updateDoc(doc(db, 'workouts', workout.id, 'exercises', exerciseId), data);
  };

  const finishWorkout = async () => {
    const allCompleted = exercises.every(e => e.completed);
    if (!allCompleted) {
      if (!confirm("Certains exercices ne sont pas terminés. Voulez-vous vraiment finir la séance ?")) return;
    }

    await updateDoc(doc(db, 'workouts', workout.id), {
      status: 'completed',
      endTime: Timestamp.now()
    });
    toast.success("Félicitations ! Séance terminée.");
    onComplete();
  };

  if (loading) return <div className="flex justify-center p-12"><Clock className="animate-spin text-emerald-600" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600">
            <Dumbbell size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-900">{workout.name}</h1>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Clock size={14} />
              <span>Temps écoulé : <span className="font-mono font-bold text-emerald-600">{elapsedTime}</span></span>
            </div>
          </div>
        </div>
        <Button 
          variant="outline" 
          onClick={finishWorkout}
          className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 font-bold h-12 px-8 rounded-xl"
        >
          <Flag className="mr-2" size={18} /> TERMINER LA SÉANCE
        </Button>
      </div>

      {/* Exercises List */}
      <div className="space-y-4">
        {exercises.map((exercise, idx) => (
          <motion.div 
            key={exercise.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className={`overflow-hidden border-none shadow-md transition-all ${exercise.completed ? 'bg-emerald-50/50 opacity-80' : 'bg-white'}`}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-bold border-slate-200 text-slate-400">EXERCICE {idx + 1}</Badge>
                    {exercise.completed && <Badge className="bg-emerald-500 text-white border-none text-[10px]">COMPLÉTÉ</Badge>}
                  </div>
                  <CardTitle className="text-xl text-blue-900">{exercise.name}</CardTitle>
                </div>
                <Checkbox 
                  checked={exercise.completed} 
                  onCheckedChange={(checked) => updateExercise(exercise.id, { completed: !!checked })}
                  className="h-8 w-8 rounded-lg border-slate-200 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                />
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl">
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">Objectif</p>
                    <p className="text-sm font-bold text-blue-900">
                      {exercise.plannedSets} séries 
                      {exercise.trackingTypes?.includes('reps') && ` x ${exercise.plannedReps} reps`}
                      {exercise.trackingTypes?.includes('weight') && ` @ ${exercise.plannedWeight}kg`}
                      {exercise.trackingTypes?.includes('duration') && ` (${exercise.plannedDuration})`}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">Repos</p>
                    <p className="text-lg font-bold text-blue-900">{exercise.restTime || 'N/A'}</p>
                  </div>
                  <div className="text-center col-span-2 md:col-span-1">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">Muscles</p>
                    <p className="text-sm font-medium text-blue-800 line-clamp-1">{exercise.muscles || 'Général'}</p>
                  </div>
                  {exercise.videoUrl && (
                    <div className="flex items-center justify-center">
                      <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => window.open(exercise.videoUrl, '_blank')}>
                        <Video size={16} className="mr-1" /> Vidéo
                      </Button>
                    </div>
                  )}
                </div>

                {/* Adjustments */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-slate-600 flex items-center gap-2">
                      <Activity size={16} className="text-emerald-500" /> Performance réelle
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase text-slate-400 font-bold">Séries</label>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateExercise(exercise.id, { actualSets: (exercise.actualSets || exercise.plannedSets) - 1 })}>
                            <Minus size={14} />
                          </Button>
                          <Input 
                            type="number" 
                            value={exercise.actualSets ?? exercise.plannedSets ?? ''} 
                            onChange={(e) => updateExercise(exercise.id, { actualSets: parseInt(e.target.value) || 0 })}
                            className="h-8 w-12 text-center p-0 font-bold border-none bg-slate-100"
                          />
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateExercise(exercise.id, { actualSets: (exercise.actualSets || exercise.plannedSets) + 1 })}>
                            <Plus size={14} />
                          </Button>
                        </div>
                      </div>
                      
                      {exercise.trackingTypes?.includes('reps') && (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-slate-400 font-bold">Reps</label>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateExercise(exercise.id, { actualReps: (exercise.actualReps || exercise.plannedReps || 0) - 1 })}>
                              <Minus size={14} />
                            </Button>
                            <Input 
                              type="number" 
                              value={exercise.actualReps ?? exercise.plannedReps ?? ''} 
                              onChange={(e) => updateExercise(exercise.id, { actualReps: parseInt(e.target.value) || 0 })}
                              className="h-8 w-12 text-center p-0 font-bold border-none bg-slate-100"
                            />
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateExercise(exercise.id, { actualReps: (exercise.actualReps || exercise.plannedReps || 0) + 1 })}>
                              <Plus size={14} />
                            </Button>
                          </div>
                        </div>
                      )}

                      {exercise.trackingTypes?.includes('weight') && (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-slate-400 font-bold">Poids (kg)</label>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateExercise(exercise.id, { actualWeight: (exercise.actualWeight || exercise.plannedWeight || 0) - 1 })}>
                              <Minus size={14} />
                            </Button>
                            <Input 
                              type="number" 
                              value={exercise.actualWeight ?? exercise.plannedWeight ?? ''} 
                              onChange={(e) => updateExercise(exercise.id, { actualWeight: parseInt(e.target.value) || 0 })}
                              className="h-8 w-12 text-center p-0 font-bold border-none bg-slate-100"
                            />
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateExercise(exercise.id, { actualWeight: (exercise.actualWeight || exercise.plannedWeight || 0) + 1 })}>
                              <Plus size={14} />
                            </Button>
                          </div>
                        </div>
                      )}

                      {exercise.trackingTypes?.includes('duration') && (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-slate-400 font-bold">Durée</label>
                          <Input 
                            value={exercise.actualDuration ?? exercise.plannedDuration ?? ''} 
                            onChange={(e) => updateExercise(exercise.id, { actualDuration: e.target.value })}
                            className="h-8 w-full text-center font-bold border-none bg-slate-100"
                            placeholder="ex: 1:15"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-bold text-slate-600">Difficulté ressentie</p>
                    <div className="flex gap-2">
                      {[
                        { id: 'too-easy', label: 'Facile', color: 'bg-blue-100 text-blue-700' },
                        { id: 'just-right', label: 'Parfait', color: 'bg-emerald-100 text-emerald-700' },
                        { id: 'too-hard', label: 'Dur', color: 'bg-rose-100 text-rose-700' }
                      ].map((diff) => (
                        <Button 
                          key={diff.id}
                          variant={exercise.difficulty === diff.id ? 'default' : 'outline'}
                          size="sm"
                          className={`flex-1 text-[10px] h-8 rounded-lg ${exercise.difficulty === diff.id ? '' : 'border-slate-200'}`}
                          onClick={() => updateExercise(exercise.id, { difficulty: diff.id as any })}
                        >
                          {diff.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {exercise.explanation && (
                  <div className="bg-blue-50/50 p-4 rounded-2xl flex gap-3">
                    <Info size={18} className="text-blue-500 shrink-0" />
                    <p className="text-xs text-blue-800 leading-relaxed">{exercise.explanation}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
