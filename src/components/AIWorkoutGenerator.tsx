import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { UserProfile, LibraryExercise } from '../types';
import { generateWorkoutPlan, GeneratedWorkout } from '../lib/gemini';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Sparkles, Dumbbell, Clock, Loader2, CheckCircle2, AlertCircle, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface AIWorkoutGeneratorProps {
  open: boolean;
  onClose: () => void;
  clients: UserProfile[];
  library: LibraryExercise[];
  coachId: string;
}

export default function AIWorkoutGenerator({ open, onClose, clients, library, coachId }: AIWorkoutGeneratorProps) {
  const [step, setStep] = useState<'config' | 'preview' | 'saved'>('config');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState<GeneratedWorkout | null>(null);

  const [config, setConfig] = useState({
    clientId: '',
    focus: 'full-body',
    duration: '45 minutes',
    difficulty: 'intermédiaire',
    equipment: 'haltères, barres, machines',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  const selectedClient = clients.find(c => c.uid === config.clientId);

  const handleGenerate = async () => {
    if (!config.clientId) {
      toast.error("Sélectionnez un client");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const client = clients.find(c => c.uid === config.clientId)!;
      const result = await generateWorkoutPlan(
        {
          firstName: client.firstName,
          primaryObjective: client.primaryObjective,
          secondaryObjectives: client.secondaryObjectives,
          currentWeight: client.currentWeight,
          height: client.height,
          medicalConditions: client.medicalConditions,
        },
        library.map(e => ({ name: e.name, muscles: e.muscles || '', trackingTypes: e.trackingTypes })),
        {
          focus: config.focus,
          duration: config.duration,
          difficulty: config.difficulty,
          equipment: config.equipment,
        }
      );
      setGenerated(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generated || !config.clientId) return;

    setLoading(true);
    try {
      const workoutRef = await addDoc(collection(db, 'workouts'), {
        clientId: config.clientId,
        coachId,
        name: generated.name,
        date: Timestamp.fromDate(new Date(config.date + 'T12:00:00')),
        status: 'planned',
      });

      // Add exercises
      for (let i = 0; i < generated.exercises.length; i++) {
        const ex = generated.exercises[i];
        await addDoc(collection(db, 'workouts', workoutRef.id, 'exercises'), {
          name: ex.name,
          muscles: ex.muscles,
          explanation: ex.explanation,
          trackingTypes: ex.trackingTypes,
          plannedSets: ex.sets,
          plannedReps: ex.reps || null,
          plannedWeight: ex.weight || null,
          plannedDuration: ex.duration || null,
          restTime: ex.restTime,
          completed: false,
          order: i,
          actualSets: 0,
          actualReps: 0,
          actualWeight: 0,
          actualDuration: '',
          difficulty: null,
          videoUrl: '',
        });
      }

      toast.success("Séance IA enregistrée avec succès !");
      setStep('saved');
      setTimeout(() => {
        onClose();
        setStep('config');
        setGenerated(null);
      }, 1500);
    } catch (err) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setStep('config');
    setGenerated(null);
    setError('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-2 rounded-xl">
              <Sparkles size={20} className="text-white" />
            </div>
            Générateur de Séance IA
          </DialogTitle>
          <DialogDescription>
            L'IA analyse le profil du client et crée un programme adapté.
          </DialogDescription>
        </DialogHeader>

        {step === 'config' && (
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={config.clientId} onValueChange={val => setConfig({...config, clientId: val})}>
                <SelectTrigger><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.uid} value={c.uid}>
                      {c.firstName} {c.lastName} — {c.primaryObjective || 'Objectif non défini'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClient && (
              <Card className="bg-blue-50 border-none">
                <CardContent className="pt-4 space-y-1">
                  <p className="text-sm font-bold text-blue-900">{selectedClient.firstName} {selectedClient.lastName}</p>
                  <p className="text-xs text-blue-700">Objectif: {selectedClient.primaryObjective || 'Non défini'}</p>
                  <p className="text-xs text-blue-600">Poids: {selectedClient.currentWeight || selectedClient.initialWeight || '--'} kg | Taille: {selectedClient.height || '--'} cm</p>
                  {selectedClient.medicalConditions && (
                    <p className="text-xs text-amber-700 flex items-center gap-1"><AlertCircle size={12} /> {selectedClient.medicalConditions}</p>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Focus musculaire</Label>
                <Select value={config.focus} onValueChange={val => setConfig({...config, focus: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-body">Full Body</SelectItem>
                    <SelectItem value="haut-du-corps">Haut du corps</SelectItem>
                    <SelectItem value="bas-du-corps">Bas du corps</SelectItem>
                    <SelectItem value="push">Push (Poussée)</SelectItem>
                    <SelectItem value="pull">Pull (Tirage)</SelectItem>
                    <SelectItem value="cardio">Cardio / HIIT</SelectItem>
                    <SelectItem value="core">Gainage / Core</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Durée souhaitée</Label>
                <Select value={config.duration} onValueChange={val => setConfig({...config, duration: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20 minutes">20 min (Express)</SelectItem>
                    <SelectItem value="30 minutes">30 min</SelectItem>
                    <SelectItem value="45 minutes">45 min</SelectItem>
                    <SelectItem value="60 minutes">1 heure</SelectItem>
                    <SelectItem value="90 minutes">1h30</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Difficulté</Label>
                <Select value={config.difficulty} onValueChange={val => setConfig({...config, difficulty: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="débutant">Débutant</SelectItem>
                    <SelectItem value="intermédiaire">Intermédiaire</SelectItem>
                    <SelectItem value="avancé">Avancé</SelectItem>
                    <SelectItem value="intensif">Intensif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={config.date} onChange={e => setConfig({...config, date: e.target.value})} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Équipement disponible</Label>
              <Input value={config.equipment} onChange={e => setConfig({...config, equipment: e.target.value})} placeholder="ex: haltères, barres, kettlebells" />
            </div>

            {error && (
              <div className="bg-rose-50 text-rose-700 p-3 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Annuler</Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || !config.clientId}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
              >
                {loading ? <Loader2 className="mr-2 animate-spin" size={18} /> : <Sparkles className="mr-2" size={18} />}
                {loading ? 'Génération en cours...' : 'Générer la séance'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && generated && (
          <div className="space-y-5 py-4">
            <div className="bg-gradient-to-r from-violet-50 to-indigo-50 p-4 rounded-xl space-y-2">
              <h3 className="text-lg font-bold text-blue-900">{generated.name}</h3>
              <p className="text-sm text-slate-600">{generated.exercises.length} exercices pour {selectedClient?.firstName}</p>
            </div>

            <div className="space-y-3">
              {generated.exercises.map((ex, idx) => (
                <Card key={idx} className="border-none shadow-sm">
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="bg-emerald-100 text-emerald-700 font-bold rounded-xl w-10 h-10 flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="font-bold text-blue-900">{ex.name}</p>
                      <p className="text-xs text-slate-500">{ex.muscles}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px]">{ex.sets} séries</Badge>
                        {ex.reps && <Badge variant="secondary" className="text-[10px]">{ex.reps} reps</Badge>}
                        {ex.weight && <Badge variant="secondary" className="text-[10px]">{ex.weight} kg</Badge>}
                        {ex.duration && <Badge variant="secondary" className="text-[10px]">{ex.duration}</Badge>}
                        <Badge variant="outline" className="text-[10px]"><Clock size={8} className="mr-1" /> {ex.restTime}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{ex.explanation}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {generated.tips && (
              <div className="bg-amber-50 p-4 rounded-xl flex gap-3">
                <Lightbulb size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">{generated.tips}</p>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep('config')}>Modifier les paramètres</Button>
              <Button variant="outline" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Sparkles className="mr-2" size={16} />}
                Régénérer
              </Button>
              <Button onClick={handleSave} disabled={loading} className="bg-emerald-600 text-white">
                {loading ? <Loader2 className="mr-2 animate-spin" size={16} /> : <CheckCircle2 className="mr-2" size={16} />}
                Enregistrer la séance
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'saved' && (
          <div className="py-12 text-center space-y-4">
            <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-blue-900">Séance enregistrée !</h3>
            <p className="text-slate-500">La séance a été ajoutée au planning de {selectedClient?.firstName}.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
