import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, hashPassword, generateSecureCode, generateSecurePassword } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, Timestamp, deleteDoc, getDocs, setDoc, orderBy, writeBatch } from 'firebase/firestore';
import { UserProfile, Workout, WorkoutExercise, LibraryExercise } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Checkbox } from './ui/checkbox';
import { UserPlus, Dumbbell, Plus, Trash2, Users, Calendar, ChevronRight, ChevronUp, ChevronDown, Search, Activity, Target, BookOpen, Edit, Save, X, Video, Weight, Clock, ListChecks, Sparkles, BarChart3, Copy, Eye, EyeOff, Filter, TrendingUp, Settings, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import AIWorkoutGenerator from './AIWorkoutGenerator';
import CoachSettings from './CoachSettings';

interface CoachAdminProps {
  user: UserProfile;
}

export default function CoachAdmin({ user }: CoachAdminProps) {
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isAddingWorkout, setIsAddingWorkout] = useState(false);
  const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);
  const [editingLibraryEx, setEditingLibraryEx] = useState<LibraryExercise | null>(null);
  const [isSavingLibrary, setIsSavingLibrary] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [builderTab, setBuilderTab] = useState<'exercises' | 'library'>('exercises');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [showPassword, setShowPassword] = useState(false);

  // New Client Form
  const [newClient, setNewClient] = useState({
    firstName: '',
    lastName: '',
    email: '',
    birthDate: '',
    height: 175,
    initialWeight: 70,
    targetWeight: 70,
    primaryObjective: '',
    secondaryObjectives: '',
    medicalConditions: '',
    clientCode: generateSecureCode(),
    password: generateSecurePassword()
  });

  // New Workout Form
  const [newWorkout, setNewWorkout] = useState({
    clientId: '',
    name: 'Séance Musculation',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  // New Library Exercise Form
  const [newLibEx, setNewLibEx] = useState<Partial<LibraryExercise>>({
    name: '',
    explanation: '',
    muscles: '',
    videoUrl: '',
    trackingTypes: ['reps']
  });

  // Workout Builder State
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [configuringExercise, setConfiguringExercise] = useState<LibraryExercise | null>(null);
  const [editingClient, setEditingClient] = useState<UserProfile | null>(null);
  const [configParams, setConfigParams] = useState({
    plannedSets: 3,
    plannedReps: 12,
    plannedWeight: 0,
    plannedDuration: '',
    restTime: '60s'
  });

  useEffect(() => {
    const qClients = query(collection(db, 'users'), where('role', '==', 'client'));
    const unsubscribeClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    });

    const qWorkouts = query(collection(db, 'workouts'), where('coachId', '==', user.uid), orderBy('date', 'desc'));
    const unsubscribeWorkouts = onSnapshot(qWorkouts, (snapshot) => {
      setWorkouts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workout)));
    });

    const qLibrary = query(collection(db, 'library'), orderBy('name', 'asc'));
    const unsubscribeLibrary = onSnapshot(qLibrary, (snapshot) => {
      setLibrary(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryExercise)));
      setLoading(false);
    });

    return () => {
      unsubscribeClients();
      unsubscribeWorkouts();
      unsubscribeLibrary();
    };
  }, [user.uid]);

  // Load exercises when editing a workout
  useEffect(() => {
    if (!editingWorkout) return;
    const q = query(collection(db, 'workouts', editingWorkout.id, 'exercises'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWorkoutExercises(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutExercise)));
    });
    return () => unsubscribe();
  }, [editingWorkout]);

  const handleAddClient = async () => {
    try {
      const tempUid = 'client_' + Math.random().toString(36).substring(7);
      const hashedPw = await hashPassword(newClient.password);
      await setDoc(doc(db, 'users', tempUid), {
        ...newClient,
        uid: tempUid,
        role: 'client',
        currentWeight: newClient.initialWeight,
        passwordHash: hashedPw,
        password: undefined // don't store plaintext
      });
      toast.success(`Client ajouté ! Code: ${newClient.clientCode} / Mot de passe: ${newClient.password}`);
      setIsAddingClient(false);
      // Reset form with new codes
      setNewClient({
        ...newClient,
        firstName: '', lastName: '', email: '',
        clientCode: generateSecureCode(),
        password: generateSecurePassword()
      });
    } catch (error) {
      toast.error("Erreur lors de l'ajout du client");
    }
  };

  const handleUpdateClient = async () => {
    if (!editingClient) return;
    try {
      const { uid, ...clientData } = editingClient;
      await updateDoc(doc(db, 'users', uid), clientData);
      toast.success("Profil client mis à jour !");
      setEditingClient(null);
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleAddWorkout = async () => {
    if (!newWorkout.clientId) {
      toast.error("Veuillez sélectionner un client");
      return;
    }

    const workoutData = {
      clientId: newWorkout.clientId,
      coachId: user.uid,
      name: newWorkout.name,
      date: Timestamp.fromDate(new Date(newWorkout.date + 'T12:00:00')),
      status: 'planned'
    };

    const docRef = await addDoc(collection(db, 'workouts'), workoutData);
    toast.success("Entraînement créé !");
    setIsAddingWorkout(false);
    setEditingWorkout({ id: docRef.id, ...workoutData } as Workout);
  };

  const handleAddToLibrary = async () => {
    if (!newLibEx.name) {
      toast.error("Le nom de l'exercice est obligatoire");
      return;
    }

    try {
      setIsSavingLibrary(true);
      const cleanData = {
        name: newLibEx.name || '',
        explanation: newLibEx.explanation || '',
        muscles: newLibEx.muscles || '',
        videoUrl: newLibEx.videoUrl || '',
        trackingTypes: newLibEx.trackingTypes || ['reps']
      };

      if (editingLibraryEx) {
        await updateDoc(doc(db, 'library', editingLibraryEx.id), cleanData);
        toast.success("Exercice mis à jour");
      } else {
        await addDoc(collection(db, 'library'), cleanData);
        toast.success("Exercice ajouté à la bibliothèque");
      }

      setIsAddingToLibrary(false);
      setEditingLibraryEx(null);
      setNewLibEx({ name: '', explanation: '', muscles: '', videoUrl: '', trackingTypes: ['reps'] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'library');
    } finally {
      setIsSavingLibrary(false);
    }
  };

  const handleSeedLibrary = async () => {
    const seedExercises = [
      { name: 'Pompes (Pushups)', muscles: 'Pectoraux, Triceps', trackingTypes: ['reps'], explanation: 'Gardez le corps bien droit.' },
      { name: 'Squats', muscles: 'Quadriceps, Fessiers', trackingTypes: ['reps', 'weight'], explanation: 'Descendez les fesses en arrière.' },
      { name: 'Planche (Plank)', muscles: 'Abdominaux', trackingTypes: ['duration'], explanation: 'Gainage complet du corps.' },
      { name: 'Kettlebell Swing', muscles: 'Chaîne postérieure', trackingTypes: ['reps', 'weight'], explanation: 'Mouvement explosif des hanches.' },
      { name: 'Tractions (Pullups)', muscles: 'Dos, Biceps', trackingTypes: ['reps'], explanation: 'Tirez jusqu\'au menton.' },
      { name: 'Fentes (Lunges)', muscles: 'Jambes', trackingTypes: ['reps', 'weight'], explanation: 'Gardez le buste droit.' },
      { name: 'Développé Couché', muscles: 'Pectoraux', trackingTypes: ['reps', 'weight'], explanation: 'Contrôlez la descente.' },
      { name: 'Course à pied', muscles: 'Cardio', trackingTypes: ['duration'], explanation: 'Rythme régulier.' }
    ];

    try {
      const batch = writeBatch(db);
      seedExercises.forEach(ex => {
        const newDocRef = doc(collection(db, 'library'));
        batch.set(newDocRef, ex);
      });
      await batch.commit();
      toast.success("Bibliothèque initialisée avec succès !");
    } catch (error) {
      toast.error("Erreur lors de l'initialisation");
    }
  };

  const confirmAddExercise = async () => {
    if (!editingWorkout || !configuringExercise) return;

    // Re-index: use current count for clean ordering
    const newEx = {
      name: configuringExercise.name,
      explanation: configuringExercise.explanation || '',
      muscles: configuringExercise.muscles || '',
      videoUrl: configuringExercise.videoUrl || '',
      trackingTypes: configuringExercise.trackingTypes,
      plannedSets: configParams.plannedSets,
      plannedReps: configuringExercise.trackingTypes.includes('reps') ? configParams.plannedReps : null,
      plannedWeight: configuringExercise.trackingTypes.includes('weight') ? configParams.plannedWeight : null,
      plannedDuration: configuringExercise.trackingTypes.includes('duration') ? configParams.plannedDuration : null,
      restTime: configParams.restTime,
      completed: false,
      order: workoutExercises.length,
      actualSets: 0,
      actualReps: 0,
      actualWeight: 0,
      actualDuration: '',
      difficulty: null
    };

    await addDoc(collection(db, 'workouts', editingWorkout.id, 'exercises'), newEx);
    toast.success(`${configuringExercise.name} ajouté`);
    setConfiguringExercise(null);
  };

  const removeExerciseFromWorkout = async (exId: string) => {
    if (!editingWorkout) return;
    await deleteDoc(doc(db, 'workouts', editingWorkout.id, 'exercises', exId));

    // Re-index remaining exercises
    const remaining = workoutExercises.filter(e => e.id !== exId);
    const batch = writeBatch(db);
    remaining.forEach((ex, idx) => {
      batch.update(doc(db, 'workouts', editingWorkout.id, 'exercises', ex.id), { order: idx });
    });
    await batch.commit();
  };

  const moveExercise = async (idx: number, direction: 'up' | 'down') => {
    if (!editingWorkout) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= workoutExercises.length) return;

    const batch = writeBatch(db);
    batch.update(doc(db, 'workouts', editingWorkout.id, 'exercises', workoutExercises[idx].id), { order: swapIdx });
    batch.update(doc(db, 'workouts', editingWorkout.id, 'exercises', workoutExercises[swapIdx].id), { order: idx });
    await batch.commit();
  };

  // Client stats helper
  const getClientStats = (clientId: string) => {
    const clientWorkouts = workouts.filter(w => w.clientId === clientId);
    const completed = clientWorkouts.filter(w => w.status === 'completed' || w.status === 'auto-completed').length;
    const planned = clientWorkouts.filter(w => w.status === 'planned').length;
    return { total: clientWorkouts.length, completed, planned };
  };

  // Filtered workouts
  const filteredWorkouts = workouts.filter(w => {
    if (statusFilter !== 'all' && w.status !== statusFilter) return false;
    if (clientFilter !== 'all' && w.clientId !== clientFilter) return false;
    if (searchQuery) {
      const client = clients.find(c => c.uid === w.clientId);
      const clientName = client ? `${client.firstName} ${client.lastName}` : '';
      return w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        clientName.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  // Filtered library
  const filteredLibrary = library.filter(ex => {
    if (!searchQuery) return true;
    return ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ex.muscles || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-blue-900">Espace Coach</h1>
          <p className="text-slate-500">Gérez vos clients et leurs programmes d'entraînement.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setShowAIGenerator(true)} className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl">
            <Sparkles className="mr-2" size={18} /> Générer avec l'IA
          </Button>

          <Dialog open={isAddingClient} onOpenChange={setIsAddingClient}>
            <DialogTrigger render={
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                <UserPlus className="mr-2" size={18} /> Nouveau Client
              </Button>
            } />
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Ajouter un nouveau client</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2"><Label>Prénom</Label><Input value={newClient.firstName} onChange={e => setNewClient({...newClient, firstName: e.target.value})} /></div>
                <div className="space-y-2"><Label>Nom</Label><Input value={newClient.lastName} onChange={e => setNewClient({...newClient, lastName: e.target.value})} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} /></div>
                <div className="space-y-2"><Label>Date de naissance</Label><Input type="date" value={newClient.birthDate} onChange={e => setNewClient({...newClient, birthDate: e.target.value})} /></div>
                <div className="space-y-2"><Label>Taille (cm)</Label><Input type="number" value={newClient.height || ''} onChange={e => setNewClient({...newClient, height: parseInt(e.target.value) || 0})} /></div>
                <div className="space-y-2"><Label>Poids Initial (kg)</Label><Input type="number" value={newClient.initialWeight || ''} onChange={e => setNewClient({...newClient, initialWeight: parseInt(e.target.value) || 0})} /></div>
                <div className="space-y-2"><Label>Poids Visé (kg)</Label><Input type="number" value={newClient.targetWeight || ''} onChange={e => setNewClient({...newClient, targetWeight: parseInt(e.target.value) || 0})} /></div>
                <div className="space-y-2"><Label>Objectif Principal</Label><Input value={newClient.primaryObjective} onChange={e => setNewClient({...newClient, primaryObjective: e.target.value})} /></div>
                <div className="space-y-2 col-span-2"><Label>Objectifs Secondaires</Label><Textarea value={newClient.secondaryObjectives} onChange={e => setNewClient({...newClient, secondaryObjectives: e.target.value})} /></div>
                <Separator className="col-span-2" />
                <div className="col-span-2 bg-blue-50 p-4 rounded-xl space-y-3">
                  <p className="text-sm font-bold text-blue-900">Identifiants de connexion (générés automatiquement)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Code Client</Label>
                      <div className="flex gap-2">
                        <Input value={newClient.clientCode} readOnly className="font-mono font-bold" />
                        <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(newClient.clientCode)}><Copy size={14} /></Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mot de passe</Label>
                      <div className="flex gap-2">
                        <Input type={showPassword ? 'text' : 'password'} value={newClient.password} readOnly className="font-mono" />
                        <Button variant="outline" size="icon" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={handleAddClient} className="bg-emerald-600 hover:bg-emerald-700 text-white">Créer le profil</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddingWorkout} onOpenChange={setIsAddingWorkout}>
            <DialogTrigger render={
              <Button variant="outline" className="border-blue-900 text-blue-900 hover:bg-blue-50 rounded-xl">
                <Plus className="mr-2" size={18} /> Créer Entraînement
              </Button>
            } />
            <DialogContent>
              <DialogHeader><DialogTitle>Nouvel entraînement</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select onValueChange={val => setNewWorkout({...newWorkout, clientId: val})}>
                    <SelectTrigger><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                    <SelectContent>{clients.map(c => (<SelectItem key={c.uid} value={c.uid}>{c.firstName} {c.lastName}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Nom de la séance</Label><Input value={newWorkout.name} onChange={e => setNewWorkout({...newWorkout, name: e.target.value})} /></div>
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={newWorkout.date} onChange={e => setNewWorkout({...newWorkout, date: e.target.value})} /></div>
              </div>
              <DialogFooter><Button onClick={handleAddWorkout} className="bg-emerald-600 hover:bg-emerald-700 text-white">Créer & Configurer</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="clients" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl mb-6">
          <TabsTrigger value="clients" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-600"><Users size={16} className="mr-2" /> Clients ({clients.length})</TabsTrigger>
          <TabsTrigger value="workouts" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-600"><Calendar size={16} className="mr-2" /> Entraînements ({workouts.length})</TabsTrigger>
          <TabsTrigger value="library" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-600"><BookOpen size={16} className="mr-2" /> Bibliothèque ({library.length})</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-600"><Settings size={16} className="mr-2" /> Paramètres</TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clients.map(client => {
              const stats = getClientStats(client.uid);
              return (
                <Card key={client.uid} className="border-none shadow-md hover:shadow-lg transition-shadow overflow-hidden group">
                  <div className="h-2 bg-emerald-500"></div>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl text-blue-900">{client.firstName} {client.lastName}</CardTitle>
                        <CardDescription>{client.email}</CardDescription>
                      </div>
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-blue-600" onClick={() => setEditingClient(client)}>
                        <Edit size={18} />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 p-3 rounded-xl text-center">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Poids</p>
                        <p className="text-lg font-bold text-blue-900">{client.currentWeight || client.initialWeight || '--'}</p>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-xl text-center">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold mb-1">Objectif</p>
                        <p className="text-lg font-bold text-blue-900">{client.targetWeight || '--'}</p>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-xl text-center">
                        <p className="text-[10px] uppercase tracking-wider text-blue-600 font-bold mb-1">Séances</p>
                        <p className="text-lg font-bold text-blue-900">{stats.completed}<span className="text-xs text-slate-400">/{stats.total}</span></p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Objectif Principal</p>
                      <p className="text-sm font-medium text-slate-700 truncate">{client.primaryObjective || "Non défini"}</p>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
                        Code: <span className="font-mono text-blue-600">{client.clientCode}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">Détails <ChevronRight size={14} className="ml-1" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="workouts">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Rechercher une séance..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Tous les clients" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les clients</SelectItem>
                {clients.map(c => (<SelectItem key={c.uid} value={c.uid}>{c.firstName} {c.lastName}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="planned">Planifié</SelectItem>
                <SelectItem value="in-progress">En cours</SelectItem>
                <SelectItem value="completed">Terminé</SelectItem>
                <SelectItem value="auto-completed">Auto-terminé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="border-none shadow-md">
            <ScrollArea className="h-[600px]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                  <tr>
                    <th className="p-4 border-b border-slate-100">Client</th>
                    <th className="p-4 border-b border-slate-100">Séance</th>
                    <th className="p-4 border-b border-slate-100">Date</th>
                    <th className="p-4 border-b border-slate-100">Statut</th>
                    <th className="p-4 border-b border-slate-100">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkouts.map(workout => {
                    const client = clients.find(c => c.uid === workout.clientId);
                    return (
                      <tr key={workout.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                        <td className="p-4"><div className="font-bold text-blue-900">{client ? `${client.firstName} ${client.lastName}` : 'Inconnu'}</div></td>
                        <td className="p-4 text-slate-600">{workout.name}</td>
                        <td className="p-4 text-slate-500 text-sm">
                          {workout.status === 'planned' ? (
                            <Input
                              type="date"
                              value={workout.date ? format(workout.date.toDate(), 'yyyy-MM-dd') : ''}
                              onChange={async (e) => {
                                if (e.target.value) {
                                  await updateDoc(doc(db, 'workouts', workout.id), {
                                    date: Timestamp.fromDate(new Date(e.target.value + 'T12:00:00'))
                                  });
                                  toast.success('Date mise à jour');
                                }
                              }}
                              className="h-8 w-36 text-sm"
                            />
                          ) : (
                            workout.date ? format(workout.date.toDate(), 'dd MMM yyyy', { locale: fr }) : '-'
                          )}
                        </td>
                        <td className="p-4">
                          <Badge className={`border-none text-[10px] uppercase ${
                            workout.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            workout.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                            workout.status === 'auto-completed' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {workout.status === 'planned' ? 'Planifié' :
                             workout.status === 'in-progress' ? 'En cours' :
                             workout.status === 'completed' ? 'Terminé' : 'Auto-terminé'}
                          </Badge>
                        </td>
                        <td className="p-4 flex gap-2">
                          <Button variant="ghost" size="icon" className="text-blue-600 hover:bg-blue-50" onClick={() => setEditingWorkout(workout)}><Edit size={16} /></Button>
                          <Button variant="ghost" size="icon" className="text-rose-500 hover:bg-rose-50" onClick={() => deleteDoc(doc(db, 'workouts', workout.id))}><Trash2 size={16} /></Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredWorkouts.length === 0 && (
                    <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic">Aucun entraînement trouvé.</td></tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="library">
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-blue-900">Bibliothèque d'Exercices</h2>
                {library.length === 0 && (
                  <Button variant="outline" size="sm" onClick={handleSeedLibrary} className="text-blue-600 border-blue-200">
                    <Plus size={14} className="mr-1" /> Initialiser avec des exercices de base
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Rechercher..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 w-48"
                  />
                </div>
                <Dialog
                  open={isAddingToLibrary || !!editingLibraryEx}
                  onOpenChange={(open) => {
                    if (!open) {
                      setIsAddingToLibrary(false);
                      setEditingLibraryEx(null);
                      setNewLibEx({ name: '', explanation: '', muscles: '', videoUrl: '', trackingTypes: ['reps'] });
                    }
                  }}
                >
                  <DialogTrigger render={
                    <Button className="bg-blue-900 text-white" onClick={() => setIsAddingToLibrary(true)}>
                      <Plus size={18} className="mr-2" /> Ajouter un exercice
                    </Button>
                  } />
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>{editingLibraryEx ? "Modifier l'exercice" : "Nouvel exercice type"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                      <div className="col-span-2 space-y-2"><Label>Nom de l'exercice</Label><Input value={newLibEx.name} onChange={e => setNewLibEx({...newLibEx, name: e.target.value})} placeholder="ex: Pompes" /></div>
                      <div className="col-span-2 space-y-2"><Label>Muscles visés</Label><Input value={newLibEx.muscles} onChange={e => setNewLibEx({...newLibEx, muscles: e.target.value})} placeholder="ex: Pectoraux, Triceps" /></div>

                      <div className="col-span-2 space-y-3">
                        <Label>Variables de suivi nécessaires :</Label>
                        <div className="flex gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox id="reps" checked={newLibEx.trackingTypes?.includes('reps')} onCheckedChange={(checked) => {
                              const current = newLibEx.trackingTypes || [];
                              setNewLibEx({...newLibEx, trackingTypes: checked ? [...current, 'reps'] : current.filter(t => t !== 'reps')});
                            }} />
                            <label htmlFor="reps" className="text-sm font-medium leading-none">Répétitions</label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="weight" checked={newLibEx.trackingTypes?.includes('weight')} onCheckedChange={(checked) => {
                              const current = newLibEx.trackingTypes || [];
                              setNewLibEx({...newLibEx, trackingTypes: checked ? [...current, 'weight'] : current.filter(t => t !== 'weight')});
                            }} />
                            <label htmlFor="weight" className="text-sm font-medium leading-none">Poids</label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="duration" checked={newLibEx.trackingTypes?.includes('duration')} onCheckedChange={(checked) => {
                              const current = newLibEx.trackingTypes || [];
                              setNewLibEx({...newLibEx, trackingTypes: checked ? [...current, 'duration'] : current.filter(t => t !== 'duration')});
                            }} />
                            <label htmlFor="duration" className="text-sm font-medium leading-none">Durée</label>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-2 space-y-2"><Label>URL Vidéo (Optionnel)</Label><Input value={newLibEx.videoUrl} onChange={e => setNewLibEx({...newLibEx, videoUrl: e.target.value})} /></div>
                      <div className="col-span-2 space-y-2"><Label>Explication / Bénéfices</Label><Textarea value={newLibEx.explanation} onChange={e => setNewLibEx({...newLibEx, explanation: e.target.value})} /></div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddToLibrary} className="bg-emerald-600 text-white" disabled={isSavingLibrary}>
                        {isSavingLibrary ? "Enregistrement..." : "Enregistrer"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLibrary.map(ex => (
                <Card key={ex.id} className="border-none shadow-sm hover:shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg text-blue-900">{ex.name}</CardTitle>
                      <div className="flex gap-1">
                        {ex.trackingTypes?.map(t => (
                          <Badge key={t} variant="secondary" className="text-[8px] uppercase p-1">
                            {t === 'reps' ? <ListChecks size={10} /> : t === 'weight' ? <Weight size={10} /> : <Clock size={10} />}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <CardDescription>{ex.muscles}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-slate-500 line-clamp-2">{ex.explanation}</p>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-blue-600 hover:bg-blue-50"
                        onClick={() => {
                          setEditingLibraryEx(ex);
                          setNewLibEx({
                            name: ex.name,
                            explanation: ex.explanation,
                            muscles: ex.muscles,
                            videoUrl: ex.videoUrl,
                            trackingTypes: ex.trackingTypes
                          });
                        }}
                      >
                        <Edit size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-rose-500 hover:bg-rose-50" onClick={() => deleteDoc(doc(db, 'library', ex.id))}><Trash2 size={14} /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <CoachSettings user={user} />
        </TabsContent>
      </Tabs>

      {/* Dialog de modification client */}
      <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Modifier le profil client</DialogTitle></DialogHeader>
          {editingClient && (
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2"><Label>Prénom</Label><Input value={editingClient.firstName} onChange={e => setEditingClient({...editingClient, firstName: e.target.value})} /></div>
              <div className="space-y-2"><Label>Nom</Label><Input value={editingClient.lastName} onChange={e => setEditingClient({...editingClient, lastName: e.target.value})} /></div>
              <div className="space-y-2"><Label>Date de naissance</Label><Input type="date" value={editingClient.birthDate || ''} onChange={e => setEditingClient({...editingClient, birthDate: e.target.value})} /></div>
              <div className="space-y-2"><Label>Taille (cm)</Label><Input type="number" value={editingClient.height || ''} onChange={e => setEditingClient({...editingClient, height: parseInt(e.target.value) || 0})} /></div>
              <div className="space-y-2"><Label>Poids Initial (kg)</Label><Input type="number" value={editingClient.initialWeight || ''} onChange={e => setEditingClient({...editingClient, initialWeight: parseInt(e.target.value) || 0})} /></div>
              <div className="space-y-2"><Label>Poids Visé (kg)</Label><Input type="number" value={editingClient.targetWeight || ''} onChange={e => setEditingClient({...editingClient, targetWeight: parseInt(e.target.value) || 0})} /></div>
              <div className="space-y-2"><Label>Objectif Principal</Label><Input value={editingClient.primaryObjective} onChange={e => setEditingClient({...editingClient, primaryObjective: e.target.value})} /></div>
              <div className="space-y-2 col-span-2"><Label>Objectifs Secondaires</Label><Textarea value={editingClient.secondaryObjectives} onChange={e => setEditingClient({...editingClient, secondaryObjectives: e.target.value})} /></div>
              <div className="space-y-2 col-span-2"><Label>Conditions Médicales</Label><Textarea value={editingClient.medicalConditions} onChange={e => setEditingClient({...editingClient, medicalConditions: e.target.value})} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingClient(null)}>Annuler</Button>
            <Button onClick={handleUpdateClient} className="bg-blue-900 text-white">Enregistrer les modifications</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workout Builder Dialog */}
      <Dialog open={!!editingWorkout} onOpenChange={(open) => !open && setEditingWorkout(null)}>
        <DialogContent className="max-w-2xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b bg-slate-50">
            <DialogTitle className="text-2xl text-blue-900">{editingWorkout?.name}</DialogTitle>
            <DialogDescription>Configuration de la séance pour {clients.find(c => c.uid === editingWorkout?.clientId)?.firstName}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Tab switcher */}
            <div className="flex border-b bg-slate-50 shrink-0">
              <button
                className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${builderTab === 'exercises' ? 'border-emerald-500 text-emerald-700 bg-white' : 'border-transparent text-slate-400'}`}
                onClick={() => setBuilderTab('exercises')}
              >
                <Dumbbell size={16} /> Exercices ({workoutExercises.length})
              </button>
              <button
                className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${builderTab === 'library' ? 'border-blue-500 text-blue-700 bg-white' : 'border-transparent text-slate-400'}`}
                onClick={() => setBuilderTab('library')}
              >
                <BookOpen size={16} /> Ajouter depuis la bibliothèque
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              {/* Exercises panel */}
              <div className={`h-full p-4 md:p-6 overflow-y-auto space-y-4 ${builderTab === 'library' ? 'hidden' : ''}`}>
                {workoutExercises.length > 0 ? (
                  workoutExercises.map((ex, idx) => (
                    <div key={ex.id} className="bg-white border rounded-xl p-3 md:p-4 shadow-sm space-y-3 relative group">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-300 hover:text-blue-600" disabled={idx === 0} onClick={() => moveExercise(idx, 'up')}><ChevronUp size={14} /></Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-300 hover:text-blue-600" disabled={idx === workoutExercises.length - 1} onClick={() => moveExercise(idx, 'down')}><ChevronDown size={14} /></Button>
                          </div>
                          <div className="font-bold text-blue-900 text-sm md:text-base">{idx + 1}. {ex.name}</div>
                        </div>
                        <Button variant="ghost" size="icon" className="text-rose-400 hover:text-rose-600 h-6 w-6" onClick={() => removeExerciseFromWorkout(ex.id)}><Trash2 size={14} /></Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Séries</Label>
                          <Input type="number" value={ex.plannedSets || ''} onChange={e => updateDoc(doc(db, 'workouts', editingWorkout!.id, 'exercises', ex.id), { plannedSets: parseInt(e.target.value) || 0 })} className="h-8" />
                        </div>
                        {ex.trackingTypes?.includes('reps') && (
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase">Reps</Label>
                            <Input type="number" value={ex.plannedReps || ''} onChange={e => updateDoc(doc(db, 'workouts', editingWorkout!.id, 'exercises', ex.id), { plannedReps: parseInt(e.target.value) || 0 })} className="h-8" />
                          </div>
                        )}
                        {ex.trackingTypes?.includes('weight') && (
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase">Poids (kg)</Label>
                            <Input type="number" value={ex.plannedWeight || ''} onChange={e => updateDoc(doc(db, 'workouts', editingWorkout!.id, 'exercises', ex.id), { plannedWeight: parseInt(e.target.value) || 0 })} className="h-8" />
                          </div>
                        )}
                        {ex.trackingTypes?.includes('duration') && (
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase">Durée</Label>
                            <Input value={ex.plannedDuration} onChange={e => updateDoc(doc(db, 'workouts', editingWorkout!.id, 'exercises', ex.id), { plannedDuration: e.target.value })} className="h-8" />
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Repos</Label>
                          <Input value={ex.restTime} onChange={e => updateDoc(doc(db, 'workouts', editingWorkout!.id, 'exercises', ex.id), { restTime: e.target.value })} className="h-8" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 md:py-12 text-slate-400 italic border-2 border-dashed rounded-2xl text-sm">
                    <BookOpen size={24} className="mx-auto mb-2 opacity-30" />
                    {window.innerWidth < 768 ? "Allez dans l'onglet Bibliothèque pour ajouter des exercices." : "Ajoutez des exercices depuis la bibliothèque à droite."}
                  </div>
                )}
              </div>

              {/* Library panel */}
              <div className={`h-full bg-slate-50 p-4 md:p-6 overflow-y-auto space-y-3 ${builderTab === 'exercises' ? 'hidden' : ''}`}>
                <div className="space-y-2">
                  {library.map(ex => (
                    <Button
                      key={ex.id}
                      variant="outline"
                      className="w-full justify-between bg-white hover:border-emerald-500 hover:text-emerald-600 h-auto py-3 px-4 text-left"
                      onClick={() => {
                        setConfiguringExercise(ex);
                        setConfigParams({
                          plannedSets: 3,
                          plannedReps: 12,
                          plannedWeight: 0,
                          plannedDuration: ex.trackingTypes.includes('duration') ? '1 min' : '',
                          restTime: '60s'
                        });
                      }}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-bold text-sm">{ex.name}</span>
                        <span className="text-[10px] text-slate-400">{ex.muscles}</span>
                      </div>
                      <Plus size={16} />
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 border-t bg-white">
            <Button onClick={() => setEditingWorkout(null)} className="bg-blue-900 text-white w-full h-12 rounded-xl font-bold">ENREGISTRER LA SÉANCE</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exercise Configuration Dialog */}
      <Dialog open={!!configuringExercise} onOpenChange={(open) => !open && setConfiguringExercise(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurer l'exercice</DialogTitle>
            <DialogDescription>{configuringExercise?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de séries</Label>
              <Input type="number" value={configParams.plannedSets || ''} onChange={e => setConfigParams({...configParams, plannedSets: parseInt(e.target.value) || 0})} />
            </div>
            {configuringExercise?.trackingTypes.includes('reps') && (
              <div className="space-y-2">
                <Label>Répétitions</Label>
                <Input type="number" value={configParams.plannedReps || ''} onChange={e => setConfigParams({...configParams, plannedReps: parseInt(e.target.value) || 0})} />
              </div>
            )}
            {configuringExercise?.trackingTypes.includes('weight') && (
              <div className="space-y-2">
                <Label>Poids (kg)</Label>
                <Input type="number" value={configParams.plannedWeight || ''} onChange={e => setConfigParams({...configParams, plannedWeight: parseInt(e.target.value) || 0})} />
              </div>
            )}
            {configuringExercise?.trackingTypes.includes('duration') && (
              <div className="space-y-2">
                <Label>Durée (ex: 1 min)</Label>
                <Input value={configParams.plannedDuration} onChange={e => setConfigParams({...configParams, plannedDuration: e.target.value})} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Temps de repos (ex: 60s)</Label>
              <Input value={configParams.restTime} onChange={e => setConfigParams({...configParams, restTime: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfiguringExercise(null)}>Annuler</Button>
            <Button onClick={confirmAddExercise} className="bg-emerald-600 text-white">Ajouter à la séance</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Workout Generator */}
      <AIWorkoutGenerator
        open={showAIGenerator}
        onClose={() => setShowAIGenerator(false)}
        clients={clients}
        library={library}
        coachId={user.uid}
      />
    </div>
  );
}
