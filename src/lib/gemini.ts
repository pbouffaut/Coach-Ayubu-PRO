import { GoogleGenAI } from '@google/genai';

// Vite replaces process.env.GEMINI_API_KEY at build time via define config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    if (!GEMINI_API_KEY) {
      throw new Error('Clé API Gemini manquante. Ajoutez VITE_GEMINI_API_KEY dans votre .env');
    }
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return ai;
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
  const genAI = getAI();

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

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });

  const text = response.text || '';
  // Clean potential markdown fences
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
  const genAI = getAI();

  const prompt = `Tu es un coach sportif. Donne un conseil court (2-3 phrases max) en français pour un athlète qui vient de faire l'exercice "${exerciseName}".
Difficulté ressentie: ${difficulty}
Performance planifiée: ${performance.planned}
Performance réelle: ${performance.actual}

Donne un conseil concret et motivant. Pas de markdown, juste du texte.`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });

  return response.text || 'Continue comme ça, tu progresses !';
}

export async function analyzeProgress(
  workoutHistory: { name: string; date: string; exercises: { name: string; difficulty?: string; actualSets?: number; actualReps?: number; actualWeight?: number }[] }[],
  weightHistory: { date: string; weight: number }[],
  objectives: string
): Promise<string> {
  const genAI = getAI();

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

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });

  return response.text || 'Analyse indisponible pour le moment.';
}
