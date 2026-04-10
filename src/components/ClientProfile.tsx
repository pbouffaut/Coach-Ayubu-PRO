import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, Timestamp, orderBy, limit } from 'firebase/firestore';
import { UserProfile, WeightEntry } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { User, Scale, Ruler, Calendar, Save, Plus, History, TrendingDown, TrendingUp, Activity, Target } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ClientProfileProps {
  user: UserProfile;
}

export default function ClientProfile({ user }: ClientProfileProps) {
  const [profile, setProfile] = useState<UserProfile>(user);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [newWeight, setNewWeight] = useState<string>('');
  const [weighDate, setWeighDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingWeight, setIsAddingWeight] = useState(false);

  useEffect(() => {
    // Listen to profile changes
    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setProfile({ uid: doc.id, ...doc.data() } as UserProfile);
      }
    });

    // Listen to weight history
    const q = query(
      collection(db, 'weight_tracking'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubWeight = onSnapshot(q, (snapshot) => {
      setWeightHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WeightEntry)));
    });

    return () => {
      unsubProfile();
      unsubWeight();
    };
  }, [user.uid]);

  const handleUpdateProfile = async () => {
    try {
      setIsSaving(true);
      const { uid, ...profileData } = profile;
      await updateDoc(doc(db, 'users', user.uid), {
        ...profileData,
        height: Number(profileData.height) || 0,
        waistCircumference: Number(profileData.waistCircumference) || 0,
        initialWeight: Number(profileData.initialWeight) || 0,
      });
      toast.success("Profil mis à jour avec succès !");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddWeight = async () => {
    if (!newWeight || isNaN(Number(newWeight))) {
      toast.error("Veuillez saisir un poids valide");
      return;
    }

    try {
      setIsAddingWeight(true);
      const weightVal = Number(newWeight);
      const dateVal = new Date(weighDate);
      
      await addDoc(collection(db, 'weight_tracking'), {
        userId: user.uid,
        weight: weightVal,
        date: Timestamp.fromDate(dateVal)
      });

      // Also update current weight in profile
      await updateDoc(doc(db, 'users', user.uid), {
        currentWeight: weightVal
      });

      toast.success("Pesée enregistrée !");
      setNewWeight('');
      setIsAddingWeight(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'weight_tracking');
    } finally {
      setIsAddingWeight(false);
    }
  };

  const chartData = [...weightHistory]
    .reverse()
    .map(entry => ({
      date: format(entry.date.toDate(), 'dd/MM'),
      weight: entry.weight
    }));

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex items-center gap-4">
        <div className="bg-blue-900 p-3 rounded-2xl text-white">
          <User size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-blue-900">Mon Profil Athlète</h1>
          <p className="text-slate-500">Gérez vos informations personnelles et votre suivi.</p>
        </div>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl mb-6">
          <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-900">
            <User size={16} className="mr-2" /> Informations
          </TabsTrigger>
          <TabsTrigger value="weight" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-900">
            <Scale size={16} className="mr-2" /> Suivi de Poids
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-xl text-blue-900">Données Personnelles</CardTitle>
              <CardDescription>Ces informations aident votre coach à adapter vos programmes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Prénom</Label>
                  <Input value={profile.firstName} onChange={e => setProfile({...profile, firstName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={profile.lastName} onChange={e => setProfile({...profile, lastName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Date de naissance</Label>
                  <Input type="date" value={profile.birthDate || ''} onChange={e => setProfile({...profile, birthDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Taille (cm)</Label>
                  <Input type="number" value={profile.height || ''} onChange={e => setProfile({...profile, height: Number(e.target.value) || 0})} />
                </div>
                <div className="space-y-2">
                  <Label>Tour de taille (cm)</Label>
                  <Input type="number" value={profile.waistCircumference || ''} onChange={e => setProfile({...profile, waistCircumference: Number(e.target.value) || 0})} />
                </div>
                <div className="space-y-2">
                  <Label>Poids initial (kg)</Label>
                  <Input type="number" value={profile.initialWeight || ''} onChange={e => setProfile({...profile, initialWeight: Number(e.target.value) || 0})} />
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Objectif Principal</Label>
                  <Input value={profile.primaryObjective || ''} onChange={e => setProfile({...profile, primaryObjective: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Objectifs Secondaires</Label>
                  <Textarea value={profile.secondaryObjectives || ''} onChange={e => setProfile({...profile, secondaryObjectives: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Conditions Médicales / Blessures</Label>
                  <Textarea value={profile.medicalConditions || ''} onChange={e => setProfile({...profile, medicalConditions: e.target.value})} />
                </div>
              </div>
              <Separator />
              <div className="flex justify-end">
                <Button onClick={handleUpdateProfile} disabled={isSaving} className="bg-blue-900 text-white rounded-xl h-12 px-8">
                  <Save className="mr-2" size={18} /> {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weight" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-none shadow-md bg-emerald-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-emerald-600 uppercase">Poids Actuel</p>
                    <p className="text-3xl font-bold text-blue-900">{profile.currentWeight || profile.initialWeight || '--'} kg</p>
                  </div>
                  <Scale className="text-emerald-500" size={32} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-blue-600 uppercase">Objectif Poids</p>
                    <p className="text-3xl font-bold text-blue-900">{profile.targetWeight || '--'} kg</p>
                  </div>
                  <Target className="text-blue-500" size={32} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-slate-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Progression</p>
                    <div className="flex items-center gap-2">
                      <p className="text-3xl font-bold text-blue-900">
                        {profile.currentWeight && profile.initialWeight 
                          ? (profile.currentWeight - profile.initialWeight).toFixed(1)
                          : '0'} kg
                      </p>
                      {profile.currentWeight && profile.initialWeight && (
                        profile.currentWeight < profile.initialWeight 
                          ? <TrendingDown className="text-emerald-500" />
                          : <TrendingUp className="text-rose-500" />
                      )}
                    </div>
                  </div>
                  <Activity className="text-slate-400" size={32} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="text-lg text-blue-900">Nouvelle Pesée</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Poids (kg)</Label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    value={newWeight} 
                    onChange={e => setNewWeight(e.target.value)} 
                    placeholder="ex: 75.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de pesée</Label>
                  <Input 
                    type="date" 
                    value={weighDate} 
                    onChange={e => setWeighDate(e.target.value)} 
                  />
                </div>
                <Button onClick={handleAddWeight} disabled={isAddingWeight} className="w-full bg-emerald-600 text-white rounded-xl h-12">
                  <Plus className="mr-2" size={18} /> {isAddingWeight ? "Enregistrement..." : "Ajouter la pesée"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="text-lg text-blue-900">Évolution</CardTitle>
              </CardHeader>
              <CardContent className="h-[250px]">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                      <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        labelStyle={{ fontWeight: 'bold', color: '#1e3a8a' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="weight" 
                        stroke="#059669" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-6">
                    <History size={48} className="mb-2 opacity-20" />
                    <p className="text-sm">Pas assez de données pour afficher le graphique. Ajoutez au moins deux pesées.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-none shadow-md overflow-hidden">
            <CardHeader className="bg-slate-50">
              <CardTitle className="text-lg text-blue-900">Historique des pesées</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b">
                    <tr>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Poids</th>
                      <th className="px-6 py-4">Variation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {weightHistory.map((entry, idx) => {
                      const prevEntry = weightHistory[idx + 1];
                      const diff = prevEntry ? entry.weight - prevEntry.weight : 0;
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-slate-700">
                            {format(entry.date.toDate(), 'dd MMMM yyyy', { locale: fr })}
                          </td>
                          <td className="px-6 py-4 text-lg font-bold text-blue-900">
                            {entry.weight} kg
                          </td>
                          <td className="px-6 py-4">
                            {prevEntry ? (
                              <Badge variant="secondary" className={`border-none ${diff < 0 ? 'bg-emerald-100 text-emerald-700' : diff > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                                {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">Référence</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {weightHistory.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">
                          Aucune pesée enregistrée pour le moment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
