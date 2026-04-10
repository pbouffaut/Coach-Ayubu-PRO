import React, { useState, useEffect } from 'react';
import { db, hashPassword, generateSecureCode, generateSecurePassword } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { UserProfile, AISettings, AIModel } from '../types';
import { loadAISettingsFromStorage, saveAISettingsToStorage, syncAISettingsFromFirestore } from '../lib/gemini';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Settings, Users, Brain, Shield, Eye, EyeOff, CheckCircle2, XCircle, Loader2, UserPlus, UserMinus, Sparkles, Zap, Crown, AlertCircle, Copy, TestTube } from 'lucide-react';
import { toast } from 'sonner';
import { sendCredentialsEmail } from '../lib/mail';

interface CoachSettingsProps {
  user: UserProfile;
}

const AI_MODELS: { value: AIModel; label: string; description: string; cost: string }[] = [
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', description: 'Le plus économique — idéal pour un usage quotidien', cost: 'Gratuit / très faible' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Bon équilibre vitesse/qualité — recommandé', cost: 'Très faible' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Plus intelligent, raisonnement amélioré', cost: 'Modéré' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Le plus puissant — meilleure qualité de génération', cost: 'Plus élevé' },
];

export default function CoachSettings({ user }: CoachSettingsProps) {
  const [coaches, setCoaches] = useState<UserProfile[]>([]);
  const [aiSettings, setAiSettings] = useState<AISettings>({ apiKey: '', model: 'gemini-2.0-flash-lite' });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);
  const [isAddingCoach, setIsAddingCoach] = useState(false);
  const [addCoachMode, setAddCoachMode] = useState<'promote' | 'create'>('promote');
  const [newCoachEmail, setNewCoachEmail] = useState('');
  const [newCoach, setNewCoach] = useState({
    firstName: '', lastName: '', email: '',
    clientCode: generateSecureCode(),
    password: generateSecurePassword()
  });
  const [showNewCoachPassword, setShowNewCoachPassword] = useState(false);
  const [promoteLoading, setPromoteLoading] = useState(false);

  // Load coaches
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'coach'));
    const unsub = onSnapshot(q, (snap) => {
      setCoaches(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });
    return () => unsub();
  }, []);

  // Load AI settings: sync from Firestore coach profile, fallback to localStorage
  useEffect(() => {
    syncAISettingsFromFirestore(user.uid).then(setAiSettings);
  }, [user.uid]);

  // Save AI settings to both localStorage and Firestore coach profile
  const handleSaveAI = async () => {
    setSaving(true);
    try {
      // Save locally for immediate use
      saveAISettingsToStorage(aiSettings);
      // Save to Firestore coach profile for cross-browser sync
      await updateDoc(doc(db, 'users', user.uid), {
        aiSettings: {
          apiKey: aiSettings.apiKey,
          model: aiSettings.model,
          lastTested: aiSettings.lastTested || null,
        }
      });
      toast.success('Configuration IA enregistrée');
    } catch (error) {
      // Firestore save failed but localStorage worked
      toast.success('Configuration IA enregistrée localement');
    } finally {
      setSaving(false);
    }
  };

  // Test API connection
  const handleTestAPI = async () => {
    if (!aiSettings.apiKey) {
      toast.error('Saisissez une clé API');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const testAI = new GoogleGenAI({ apiKey: aiSettings.apiKey });
      const response = await testAI.models.generateContent({
        model: aiSettings.model,
        contents: 'Réponds uniquement "OK" en un seul mot.',
      });
      if (response.text) {
        setTestResult('success');
        const updated = { ...aiSettings, lastTested: new Date().toISOString() };
        setAiSettings(updated);
        saveAISettingsToStorage(updated);
        toast.success(`Connexion réussie avec ${aiSettings.model}`);
      } else {
        setTestResult('error');
        toast.error('Réponse vide du modèle');
      }
    } catch (err) {
      setTestResult('error');
      toast.error(`Erreur: ${err instanceof Error ? err.message : 'Connexion échouée'}`);
    } finally {
      setTesting(false);
    }
  };

  // Promote user to coach
  const handlePromoteToCoach = async () => {
    if (!newCoachEmail.trim()) {
      toast.error("Saisissez l'email du futur coach");
      return;
    }

    setPromoteLoading(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', newCoachEmail.trim().toLowerCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        toast.error("Aucun utilisateur trouvé avec cet email. L'utilisateur doit d'abord se connecter à l'application.");
        return;
      }

      const targetDoc = snap.docs[0];
      const targetUser = targetDoc.data() as UserProfile;

      if (targetUser.role === 'coach') {
        toast.error('Cet utilisateur est déjà coach');
        return;
      }

      await updateDoc(doc(db, 'users', targetDoc.id), { role: 'coach' });
      toast.success(`${targetUser.firstName} ${targetUser.lastName} est maintenant coach !`);
      setNewCoachEmail('');
      setIsAddingCoach(false);
    } catch (error) {
      toast.error("Erreur lors de la promotion");
    } finally {
      setPromoteLoading(false);
    }
  };

  // Create new coach with credentials
  const handleCreateCoach = async () => {
    if (!newCoach.firstName || !newCoach.lastName) {
      toast.error("Prénom et nom obligatoires");
      return;
    }
    setPromoteLoading(true);
    try {
      const tempUid = 'coach_' + Math.random().toString(36).substring(7);
      const hashedPw = await hashPassword(newCoach.password);
      await setDoc(doc(db, 'users', tempUid), {
        uid: tempUid,
        email: newCoach.email,
        role: 'coach',
        firstName: newCoach.firstName,
        lastName: newCoach.lastName,
        clientCode: newCoach.clientCode,
        passwordHash: hashedPw,
      });
      toast.success(`Coach créé !`);
      if (newCoach.email) {
        sendCredentialsEmail(newCoach.email, newCoach.firstName, newCoach.clientCode, newCoach.password, 'coach');
      }
      setIsAddingCoach(false);
      setNewCoach({
        firstName: '', lastName: '', email: '',
        clientCode: generateSecureCode(),
        password: generateSecurePassword()
      });
    } catch (error) {
      toast.error("Erreur lors de la création");
    } finally {
      setPromoteLoading(false);
    }
  };

  // Demote coach to client
  const handleDemoteCoach = async (coach: UserProfile) => {
    if (coach.uid === user.uid) {
      toast.error("Vous ne pouvez pas vous retirer le rôle coach");
      return;
    }

    if (!confirm(`Retirer le rôle coach à ${coach.firstName} ${coach.lastName} ?`)) return;

    try {
      await updateDoc(doc(db, 'users', coach.uid), { role: 'client' });
      toast.success(`${coach.firstName} n'est plus coach`);
    } catch (error) {
      toast.error("Erreur lors du changement de rôle");
    }
  };

  return (
    <div className="space-y-8">
      {/* Section: Gestion des Coaches */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-xl">
              <Shield size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-blue-900">Équipe de Coaches</h2>
              <p className="text-sm text-slate-500">Gérez qui a accès à l'espace coach.</p>
            </div>
          </div>
          <Dialog open={isAddingCoach} onOpenChange={(open) => { setIsAddingCoach(open); if (!open) setAddCoachMode('promote'); }}>
            <Button onClick={() => setIsAddingCoach(true)} className="bg-blue-900 text-white rounded-xl">
              <UserPlus className="mr-2" size={18} /> Ajouter un Coach
            </Button>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Ajouter un Coach</DialogTitle>
                <DialogDescription>Promouvoir un utilisateur existant ou créer un nouveau compte coach.</DialogDescription>
              </DialogHeader>

              {/* Mode switcher */}
              <div className="flex border rounded-xl overflow-hidden">
                <button
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${addCoachMode === 'promote' ? 'bg-blue-900 text-white' : 'bg-slate-50 text-slate-500'}`}
                  onClick={() => setAddCoachMode('promote')}
                >Promouvoir un utilisateur</button>
                <button
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${addCoachMode === 'create' ? 'bg-blue-900 text-white' : 'bg-slate-50 text-slate-500'}`}
                  onClick={() => setAddCoachMode('create')}
                >Créer un nouveau coach</button>
              </div>

              {addCoachMode === 'promote' ? (
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Email de l'utilisateur à promouvoir</Label>
                    <Input type="email" value={newCoachEmail} onChange={e => setNewCoachEmail(e.target.value)} placeholder="coach@example.com" />
                  </div>
                  <div className="bg-amber-50 p-3 rounded-xl text-sm text-amber-800 flex gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>L'utilisateur doit s'être connecté au moins une fois.</span>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddingCoach(false)}>Annuler</Button>
                    <Button onClick={handlePromoteToCoach} disabled={promoteLoading} className="bg-blue-900 text-white">
                      {promoteLoading ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Crown className="mr-2" size={16} />}
                      Promouvoir
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Prénom</Label><Input value={newCoach.firstName} onChange={e => setNewCoach({...newCoach, firstName: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Nom</Label><Input value={newCoach.lastName} onChange={e => setNewCoach({...newCoach, lastName: e.target.value})} /></div>
                  </div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={newCoach.email} onChange={e => setNewCoach({...newCoach, email: e.target.value})} /></div>
                  <Separator />
                  <div className="bg-blue-50 p-4 rounded-xl space-y-3">
                    <p className="text-sm font-bold text-blue-900">Identifiants de connexion</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Code</Label>
                        <div className="flex gap-1">
                          <Input value={newCoach.clientCode} readOnly className="font-mono font-bold h-8 text-sm" />
                          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => { navigator.clipboard.writeText(newCoach.clientCode); toast.success('Copié'); }}><Copy size={12} /></Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Mot de passe</Label>
                        <div className="flex gap-1">
                          <Input type={showNewCoachPassword ? 'text' : 'password'} value={newCoach.password} readOnly className="font-mono h-8 text-sm" />
                          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowNewCoachPassword(!showNewCoachPassword)}>
                            {showNewCoachPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddingCoach(false)}>Annuler</Button>
                    <Button onClick={handleCreateCoach} disabled={promoteLoading} className="bg-emerald-600 text-white">
                      {promoteLoading ? <Loader2 className="mr-2 animate-spin" size={16} /> : <UserPlus className="mr-2" size={16} />}
                      Créer le coach
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coaches.map(coach => (
            <Card key={coach.uid} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-100 w-10 h-10 rounded-full flex items-center justify-center">
                      <span className="text-emerald-700 font-bold text-sm">
                        {coach.firstName[0]}{coach.lastName[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-blue-900">{coach.firstName} {coach.lastName}</p>
                      <p className="text-xs text-slate-400">{coach.email}</p>
                    </div>
                  </div>
                  {coach.uid === user.uid ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px]">Vous</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                      onClick={() => handleDemoteCoach(coach)}
                    >
                      <UserMinus size={16} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* Section: Configuration IA */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="bg-violet-100 p-2 rounded-xl">
            <Brain size={20} className="text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-blue-900">Configuration IA</h2>
            <p className="text-sm text-slate-500">Configurez l'accès à Google Gemini pour la génération d'entraînements.</p>
          </div>
        </div>

        <Card className="border-none shadow-md">
          <CardContent className="pt-6 space-y-6">
            {/* API Key */}
            <div className="space-y-2">
              <Label className="font-bold">Clé API Google Gemini</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={aiSettings.apiKey}
                    onChange={e => { setAiSettings({...aiSettings, apiKey: e.target.value}); setTestResult(null); }}
                    placeholder="AIzaSy..."
                    className="pr-20 font-mono text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { navigator.clipboard.writeText(aiSettings.apiKey); toast.success('Clé copiée'); }}
                  disabled={!aiSettings.apiKey}
                >
                  <Copy size={14} />
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                Obtenez une clé sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-600 underline">Google AI Studio</a>
              </p>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <Label className="font-bold">Modèle IA</Label>
              <Select value={aiSettings.model} onValueChange={(val: AIModel) => { setAiSettings({...aiSettings, model: val}); setTestResult(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Model Info Card */}
              {(() => {
                const selected = AI_MODELS.find(m => m.value === aiSettings.model);
                if (!selected) return null;
                return (
                  <div className="bg-slate-50 p-3 rounded-xl space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-violet-500" />
                      <span className="text-sm font-medium text-slate-700">{selected.label}</span>
                    </div>
                    <p className="text-xs text-slate-500">{selected.description}</p>
                    <div className="flex items-center gap-1">
                      <Zap size={12} className="text-amber-500" />
                      <span className="text-xs text-amber-700">Coût : {selected.cost}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={handleTestAPI}
                disabled={testing || !aiSettings.apiKey}
                className="flex-1"
              >
                {testing ? (
                  <Loader2 className="mr-2 animate-spin" size={16} />
                ) : testResult === 'success' ? (
                  <CheckCircle2 className="mr-2 text-emerald-500" size={16} />
                ) : testResult === 'error' ? (
                  <XCircle className="mr-2 text-rose-500" size={16} />
                ) : (
                  <TestTube className="mr-2" size={16} />
                )}
                {testing ? 'Test en cours...' : testResult === 'success' ? 'Connexion OK' : testResult === 'error' ? 'Échec — Réessayer' : 'Tester la connexion'}
              </Button>

              <Button
                onClick={handleSaveAI}
                disabled={saving || !aiSettings.apiKey}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? <Loader2 className="mr-2 animate-spin" size={16} /> : <CheckCircle2 className="mr-2" size={16} />}
                {saving ? 'Enregistrement...' : 'Enregistrer la configuration'}
              </Button>
            </div>

            {aiSettings.lastTested && (
              <p className="text-xs text-slate-400 text-center">
                Dernier test réussi : {new Date(aiSettings.lastTested).toLocaleString('fr-FR')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
