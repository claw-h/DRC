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
  office: string;
  officeHours: string;
  phone: string;
  email: string;
  portraitUrl: string;
  institution: string;
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
      credentialId: 'DRC-001',
      title: 'Professor of Astrophysics & Formal Epistemology',
      department: 'Department of Astronomy & History of Science',
      office: 'Kepler Hall, Room 412',
      officeHours: 'Tue / Thu · 16:00–17:30',
      phone: '+1 (617) 555-0194',
      email: 'cordry@observatory.edu',
      portraitUrl: '/images/duncan-cordry-portrait.svg',
      institution: 'University Observatory Archive',
    };
  }
}

export async function updateFacultyProfile(patch: Partial<FacultyProfile>): Promise<FacultyProfile> {
  const current = await getFacultyProfile();
  const next: FacultyProfile = { ...current, ...patch };
  await fs.writeFile(PROFILE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}
