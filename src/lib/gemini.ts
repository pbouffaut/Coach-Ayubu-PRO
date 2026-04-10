import { GoogleGenAI } from '@google/genai';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { AISettings, AIModel } from '../types';

// Build-time fallback (Vite replaces this at build)
const ENV_API_KEY = process.env.GEMINI_API_KEY || '';

// AI settings are stored in users/{coachUid}.aiSettings
// We also cache in localStorage for fast access
const STORAGE_KEY = 'coach_ayubu_ai_settings';

export function loadAISettingsFromStorage(): AISettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { apiKey: ENV_API_KEY, model: 'gemini-2.0-flash-lite' };
}

export function saveAISettingsToStorage(settings: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Load from Firestore coach profile and cache locally
export async function syncAISettingsFromFirestore(coachUid: string): Promise<AISettings> {
  try {
    const snap = await getDoc(doc(db, 'users', coachUid));
    if (snap.exists()) {
      const data = snap.data();
      if (data.aiSettings) {
        const settings = data.aiSettings as AISettings;
        saveAISettingsToStorage(settings);
        return settings;
      }
    }
  } catch { /* Firestore unavailable — use local cache */ }
  return loadAISettingsFromStorage();
}

async function getAI(): Promise<{ ai: GoogleGenAI; model: AIModel }> {
  const settings = loadAISettingsFromStorage();
  // Settings key takes priority over build-time env var
  const apiKey = settings.apiKey ? settings.apiKey : ENV_API_KEY;

  if (!apiKey) {
    throw new Error('Clé API Gemini manquante. Configurez-la dans Paramètres > Configuration IA.');
  }

  return {
    ai: new GoogleGenAI({ apiKey }),
    model: settings.model || 'gemini-2.0-flash-lite',
  };
}

export interface GeneratedWorkout {
  name: string;
  exercises: {
    name: string;
    muscles: string;
    sets: number;
    reps?: number;
    weight?: number;
    duration?: string;
    restTime: string;
    explanation: string;
    trackingTypes: ('reps' | 'weight' | 'duration')[];
  }[];
  tips: string;
}

export async function generateWorkoutPlan(
  clientProfile: {
    firstName: string;
    primaryObjective?: string;
    secondaryObjectives?: string;
    currentWeight?: number;
    height?: number;
    medicalConditions?: string;
  },
  availableExercises: { name: string; muscles: string; trackingTypes: string[] }[],
  preferences: {
    focus: string;
    duration: string;
    difficulty: string;
    equipment: string;
  }
): Promise<GeneratedWorkout> {
  const { ai, model } = await getAI();

  const exerciseList = availableExercises.map(e => `- ${e.name} (${e.muscles}) [${e.trackingTypes.join(', ')}]`).join('\n');

  const prompt = `Tu es un coach sportif expert. Génère un plan d'entraînement personnalisé en JSON.

PROFIL DU CLIENT:
- Prénom: ${clientProfile.firstName}
- Objectif principal: ${clientProfile.primaryObjective || 'Remise en forme'}
- Objectifs secondaires: ${clientProfile.secondaryObjectives || 'Aucun'}
- Poids actuel: ${clientProfile.currentWeight || 'Non renseigné'} kg
- Taille: ${clientProfile.height || 'Non renseigné'} cm
- Conditions médicales: ${clientProfile.medicalConditions || 'Aucune'}

PRÉFÉRENCES DE LA SÉANCE:
- Focus: ${preferences.focus}
- Durée souhaitée: ${preferences.duration}
- Niveau de difficulté: ${preferences.difficulty}
- Équipement disponible: ${preferences.equipment}

EXERCICES DISPONIBLES DANS LA BIBLIOTHÈQUE:
${exerciseList}

INSTRUCTIONS:
- Utilise de préférence les exercices de la bibliothèque
- Tu peux aussi suggérer de nouveaux exercices pertinents
- Adapte les charges et répétitions au profil du client
- Respecte les conditions médicales
- Fournis des conseils personnalisés

Réponds UNIQUEMENT avec un JSON valide (sans markdown) dans ce format:
{
  "name": "Nom de la séance",
  "exercises": [
    {
      "name": "Nom de l'exercice",
      "muscles": "Muscles ciblés",
      "sets": 3,
      "reps": 12,
      "weight": 20,
      "duration": null,
      "restTime": "60s",
      "explanation": "Conseil d'exécution",
      "trackingTypes": ["reps", "weight"]
    }
  ],
  "tips": "Conseils généraux pour cette séance"
}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const text = response.text || '';
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(jsonStr) as GeneratedWorkout;
  } catch {
    throw new Error('Impossible de parser la réponse de l\'IA. Réessayez.');
  }
}

export async function getCoachingTip(
  exerciseName: string,
  difficulty: string,
  performance: { planned: string; actual: string }
): Promise<string> {
  const { ai, model } = await getAI();

  const prompt = `Tu es un coach sportif. Donne un conseil court (2-3 phrases max) en français pour un athlète qui vient de faire l'exercice "${exerciseName}".
Difficulté ressentie: ${difficulty}
Performance planifiée: ${performance.planned}
Performance réelle: ${performance.actual}

Donne un conseil concret et motivant. Pas de markdown, juste du texte.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || 'Continue comme ça, tu progresses !';
}

export async function analyzeProgress(
  workoutHistory: { name: string; date: string; exercises: { name: string; difficulty?: string; actualSets?: number; actualReps?: number; actualWeight?: number }[] }[],
  weightHistory: { date: string; weight: number }[],
  objectives: string
): Promise<string> {
  const { ai, model } = await getAI();

  const prompt = `Tu es un coach sportif expert. Analyse la progression de cet athlète et donne un résumé personnalisé en français (5-8 phrases).

OBJECTIFS: ${objectives}

HISTORIQUE DES ENTRAÎNEMENTS (derniers):
${JSON.stringify(workoutHistory.slice(0, 10), null, 2)}

ÉVOLUTION DU POIDS:
${JSON.stringify(weightHistory.slice(0, 20), null, 2)}

Analyse:
1. La régularité des entraînements
2. La progression des charges/répétitions
3. L'évolution du poids vs l'objectif
4. Des recommandations concrètes

Sois encourageant mais honnête. Pas de markdown, juste du texte structuré.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || 'Analyse indisponible pour le moment.';
}
