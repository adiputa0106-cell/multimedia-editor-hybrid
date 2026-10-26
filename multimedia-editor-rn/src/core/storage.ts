/**
 * Storage — AsyncStorage-based project persistence
 * Hanya menyimpan edit-state dan metadata, bukan bytes media.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Project } from './types';
import { SCHEMA_VERSION } from './types';

const PROJECTS_KEY = 'multimedia_editor_projects';
const PROJECT_PREFIX = 'project_';

export async function saveProject(project: Project): Promise<void> {
  try {
    // Save project data
    await AsyncStorage.setItem(
      `${PROJECT_PREFIX}${project.projectId}`,
      JSON.stringify(project)
    );

    // Update projects index
    const index = await getProjectsIndex();
    const existing = index.findIndex((p) => p.id === project.projectId);
    const entry = {
      id: project.projectId,
      name: project.name,
      mediaType: project.mediaType,
      updatedAt: project.updatedAt,
    };
    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.unshift(entry);
    }
    await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(index));
  } catch (e) {
    throw new Error(`Gagal menyimpan proyek: ${(e as Error).message}`);
  }
}

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PROJECT_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Project;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      console.warn(`Project schema mismatch: ${parsed.schemaVersion} vs ${SCHEMA_VERSION}`);
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PROJECT_PREFIX}${projectId}`);
  const index = await getProjectsIndex();
  const filtered = index.filter((p) => p.id !== projectId);
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered));
}

export async function getAllProjects(): Promise<Project[]> {
  const index = await getProjectsIndex();
  const projects: Project[] = [];
  for (const entry of index) {
    const p = await getProject(entry.id);
    if (p) projects.push(p);
  }
  return projects;
}

type ProjectIndexEntry = {
  id: string;
  name: string;
  mediaType: string;
  updatedAt: string;
};

async function getProjectsIndex(): Promise<ProjectIndexEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectIndexEntry[];
  } catch {
    return [];
  }
}
