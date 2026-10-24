import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { InMemorySessionStore } from '../core/session/InterviewSessionStore.js';
import { extractResumeFile, MAX_RESUME_BYTES } from './ResumeFileExtractor.js';

describe('resume upload and product configuration', () => {
  let base: string;
  let close: () => Promise<void>;
  const provider = new DeterministicProvider();
  const store = new InMemorySessionStore({ provider });
  beforeAll(async () => { const running = await createApiServer({ provider, store, authenticationRequired: false }).listen(0); base = `http://127.0.0.1:${running.port}`; close = running.close; });
  afterAll(async () => { await close(); });
  const post = (path: string, data: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

  it.each(['pdf', 'docx'])('extracts a real %s, previews actual profile, and applies corrections before planning', async (extension) => {
    const file = await readFile(new URL(`../testSupport/resume-upload.${extension}`, import.meta.url));
    const upload = await post('/resumes/file', { fileName: `resume.${extension}`, contentBase64: file.toString('base64') });
    expect(upload.status).toBe(201);
    const parsed = await upload.json();
    expect(parsed.extractedText).toContain('Jordan Lee');
    expect(parsed.extractedText).toContain('PostgreSQL');
    expect(parsed.profile.skills.map((s: { skillId: string }) => s.skillId)).toContain('databases');
    expect(parsed.profile.projects.length).toBeGreaterThan(0);
    expect(parsed.careerPath).toBeDefined();
    expect(parsed.insights.technologies).toContain('postgresql');
    const storedResume = await fetch(`${base}/resumes/${parsed.resumeId}`);
    expect((await storedResume.json()).careerPath).toEqual(parsed.careerPath);
    const reviewed = await post('/resumes/upload', { resumeText: `${parsed.extractedText}\nAdditional experience: React and frontend accessibility.`, candidateName: 'Jordan Reviewed' });
    expect(reviewed.status).toBe(201);
    const profile = await reviewed.json();
    const created = await post('/interviews', { resumeId: profile.resumeId, rolePreset: 'frontend', experienceLevel: 'junior', interviewType: 'technical', questionsPerRound: 2, targetDifficulty: 2, answerMode: 'text' });
    expect(created.status).toBe(201);
    const session = await created.json();
    expect(session.plan.candidateName).toBe('Jordan Reviewed');
    expect(session.plan.roleTitle).toBe('Frontend Engineer');
    expect(session.plan.totalQuestionBudget).toBe(4);
    expect(session.plan.rounds).toHaveLength(2);
    expect(session.plan.rounds[0].difficultyRange).toEqual({ min: 1, max: 3 });
    const machine = (await store.load(session.sessionId))!;
    expect(machine.config.profile.levelBand).toBe('junior');
    expect(machine.config.interviewPlan?.rounds[0].type).toBe('technical');
    const start = await post(`/interviews/${session.sessionId}/start`, {});
    expect(start.status).toBe(200);
    const current = await start.json();
    expect(session.plan.rounds[0].targetSkills).toContain(current.currentQuestion.skillId);
  });

  it('detects a likely career direction from the uploaded resume instead of a default preset', async () => {
    const resumeText = `Priya Patel\nMachine Learning Engineer\n\nExperience\nMachine Learning Engineer at ShopCo\nBuilt recommendation systems in Python using machine learning.\n\nProjects\nDeep learning ranking model using PyTorch.`;
    const response = await post('/resumes/upload', { candidateName: 'Priya Patel', resumeText });
    expect(response.status).toBe(201);
    const parsed = await response.json();
    expect(parsed.careerPath.recommendedRoleId).toBe('data');
    expect(parsed.careerPath.title).toBe('Data & ML Engineer');
    expect(parsed.careerPath.needsClarification).toBe(false);
    const options = await (await fetch(`${base}/interviews/options`)).json();
    expect(options.roles.some((role: { id: string }) => role.id === parsed.careerPath.recommendedRoleId)).toBe(true);
  });

  it('structures internships, domains, communication and leadership evidence from resume text', async () => {
    const resumeText = `Morgan Patel\n\nExperience\nSoftware Engineering Intern, Health Data Co — 2023 - 2024\n- Collaborated with clinical stakeholders to document a patient analytics API.\n- Led a small project using Python and PostgreSQL.\n\nProjects\nBuilt a healthcare analytics dashboard.`;
    const response = await post('/resumes/upload', { candidateName: 'Morgan Patel', resumeText });
    expect(response.status).toBe(201);
    const parsed = await response.json();
    expect(parsed.insights.internships).toHaveLength(1);
    expect(parsed.insights.internships[0].employmentType).toBe('internship');
    expect(parsed.insights.domainKnowledge).toContain('healthcare');
    expect(parsed.insights.communicationEvidence.some((item: { text: string }) => item.text.includes('Collaborated'))).toBe(true);
    expect(parsed.insights.leadershipEvidence.some((item: { text: string }) => item.text.includes('Led'))).toBe(true);
  });

  it('validates format, content and size, instead of inventing a parsed profile', async () => {
    const invalid = await post('/resumes/file', { fileName: 'fake.pdf', contentBase64: Buffer.from('not a PDF').toString('base64') });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error).toContain('not a valid PDF');
    await expect(extractResumeFile('resume.doc', Buffer.from('unsupported'))).rejects.toThrow('PDF and DOCX');
    await expect(extractResumeFile('resume.docx', Buffer.alloc(MAX_RESUME_BYTES + 1))).rejects.toThrow('5 MB');
    await expect(extractResumeFile('broken.docx', Buffer.from('PK invalid archive'))).rejects.toThrow('archive is invalid');
    expect((await post('/resumes/file', { fileName: 'resume.pdf', contentBase64: 'bad encoding !' })).status).toBe(400);
  });

  it('returns backend-owned options and history without fabricated metadata or scores', async () => {
    const options = await (await fetch(`${base}/interviews/options`)).json();
    expect(options.providerName).toBe('deterministic');
    expect(options.roles.map((r: { id: string }) => r.id)).toEqual(['backend', 'frontend', 'fullstack', 'data']);
    const list = await (await fetch(`${base}/interviews`)).json();
    expect(list.storage).toBe('memory');
    expect(list.interviews.length).toBe(2);
    for (const session of list.interviews) {
      expect(session.candidateName).toBe('Jordan Reviewed');
      expect(session.roleTitle).toBe('Frontend Engineer');
      expect(session.overallScore).toBeNull();
    }
  });
});
