import { Timestamp } from 'firebase/firestore';

export type UserRole = 'coach' | 'client';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  birthDate?: string;
  height?: number;
  waistCircumference?: number;
  initialWeight?: number;
  currentWeight?: number;
  targetWeight?: number;
  medicalConditions?: string;
  primaryObjective?: string;
  secondaryObjectives?: string;
  clientCode?: string;
  passwordHash?: string;
}

export interface WeightEntry {
  id: string;
  userId: string;
  weight: number;
  date: Timestamp;
}

export type WorkoutStatus = 'planned' | 'in-progress' | 'completed' | 'auto-completed';

export interface Workout {
  id: string;
  clientId: string;
  coachId: string;
  name: string;
  date: Timestamp;
  status: WorkoutStatus;
  startTime?: Timestamp;
  endTime?: Timestamp;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  explanation?: string;
  muscles?: string;
  videoUrl?: string;
  plannedSets: number;
  plannedReps?: number;
  plannedWeight?: number;
  plannedDuration?: string;
  restTime?: string;
  actualSets?: number;
  actualReps?: number;
  actualWeight?: number;
  actualDuration?: string;
  difficulty?: 'too-easy' | 'just-right' | 'too-hard';
  completed: boolean;
  order: number;
  trackingTypes: ('reps' | 'weight' | 'duration')[];
}

export interface LibraryExercise {
  id: string;
  name: string;
  explanation?: string;
  muscles?: string;
  videoUrl?: string;
  trackingTypes: ('reps' | 'weight' | 'duration')[];
}

export interface PerformanceStats {
  totalWorkouts: number;
  completedWorkouts: number;
  totalExercises: number;
  avgDifficulty: string;
  streakDays: number;
  weightProgress: number;
  favoriteExercise: string;
}
