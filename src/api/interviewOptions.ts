import type { RoleRequirement } from '../core/types.js';
import { backendRole } from '../testSupport/fixtures.js';

export const rolePresets: Record<string, RoleRequirement> = {
  backend: backendRole(),
  frontend: { title: 'Frontend Engineer', softRequirements: [], skills: [
    { skillId: 'frontend', weight: 1, requiredLevel: 'mid' },
    { skillId: 'testing', weight: 0.7, requiredLevel: 'mid' },
    { skillId: 'software_delivery', weight: 0.5, requiredLevel: 'mid' },
  ] },
  fullstack: { title: 'Full-Stack Engineer', softRequirements: [], skills: [
    { skillId: 'frontend', weight: 1, requiredLevel: 'mid' },
    { skillId: 'backend', weight: 1, requiredLevel: 'mid' },
    { skillId: 'databases', weight: 0.6, requiredLevel: 'mid' },
    { skillId: 'testing', weight: 0.6, requiredLevel: 'mid' },
    { skillId: 'software_delivery', weight: 0.4, requiredLevel: 'mid' },
  ] },
  data: { title: 'Data & ML Engineer', softRequirements: [], skills: [
    { skillId: 'data_engineering', weight: 1, requiredLevel: 'mid' },
    { skillId: 'databases', weight: 0.8, requiredLevel: 'mid' },
    { skillId: 'system_design', weight: 0.5, requiredLevel: 'mid' },
  ] },
};

export const interviewTypes = {
  full: ['hr_intro', 'technical', 'logic_problem_solving', 'behavioral_out_of_box'],
  technical: ['technical', 'logic_problem_solving'],
  behavioral: ['hr_intro', 'behavioral_out_of_box'],
} as const;
