import fs from 'node:fs/promises';
import path from 'node:path';

export interface SystemState {
  offlineMode: boolean;
  featuredConstellationId: string | null;
  updatedAt: string;
}

export interface FacultyProfile {
  name: string;
  monogram: string;
  credentialId: string;
  title: string;
  department: string;
  education?: string;
  office: string;
  officeHours: string;
  phone: string;
  email: string;
  portraitUrl: string;
  institution: string;
  bio?: string;
  aos?: string[];
  aoc?: string[];
  awards?: string[];
  ashokaProfileUrl?: string;
  philPeopleUrl?: string;
}

const STATE_PATH = path.resolve(process.cwd(), 'src/data/system-state.json');
const PROFILE_PATH = path.resolve(process.cwd(), 'src/data/profile.json');

let cachedState: SystemState | null = null;

export async function getSystemState(): Promise<SystemState> {
  if (cachedState) return cachedState;
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    cachedState = JSON.parse(raw) as SystemState;
    return cachedState;
  } catch {
    return {
      offlineMode: false,
      featuredConstellationId: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function updateSystemState(patch: Partial<SystemState>): Promise<SystemState> {
  const current = await getSystemState();
  const next: SystemState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  cachedState = next;
  await fs.writeFile(STATE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export async function getFacultyProfile(): Promise<FacultyProfile> {
  try {
    const raw = await fs.readFile(PROFILE_PATH, 'utf-8');
    return JSON.parse(raw) as FacultyProfile;
  } catch {
    return {
      name: 'Duncan R. Cordry',
      monogram: 'DRC',
      credentialId: 'ASHOKA-PHIL-DRC',
      title: 'Visiting Faculty of Philosophy',
      department: 'Department of Philosophy',
      education: 'Ph.D. in Philosophy, Purdue University',
      office: 'Faculty Block · Rajiv Gandhi Education City, Sonipat',
      officeHours: 'By Appointment · Semesters I & II',
      phone: '+91 (0130) 230-0000',
      email: 'duncan.cordry@ashoka.edu.in',
      portraitUrl: 'https://www.ashoka.edu.in/wp-content/uploads/2025/09/Profile-400-%C3%97-411-px-15-1.jpg',
      institution: 'Ashoka University',
      bio: 'Duncan Cordry specializes in continental philosophy and the philosophy of technology, and his primary area of research lies in understanding how technical objects and systems support specific spiritual practices, traditions, and types of social cohesion. He has abiding interests in the relation between the organic and inorganic, philosophies of time, and how such topics play a role in practices of liberation.',
      aos: ['Continental Philosophy', 'Social & Political Philosophy', 'Philosophy of Technology'],
      aoc: ['Phenomenology', 'Insurrectionist Ethics', 'American Pragmatism', 'Philosophies of Liberation'],
      awards: [
        'Claudia Jones Award for Best Graduate Paper, Caribbean Philosophical Association',
        'Ross-Lynn Research Fellowship, Purdue University',
      ],
      ashokaProfileUrl: 'https://www.ashoka.edu.in/profile/duncan-cordry/',
      philPeopleUrl: 'https://philpeople.org/profiles/duncan-r-cordry',
    };
  }
}

export async function updateFacultyProfile(patch: Partial<FacultyProfile>): Promise<FacultyProfile> {
  const current = await getFacultyProfile();
  const next: FacultyProfile = { ...current, ...patch };
  await fs.writeFile(PROFILE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}
