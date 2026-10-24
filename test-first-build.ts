// FIRST BUILD TARGET — Minimum viable intelligence brain test
// Validates core modules can run independently.

import { DeterministicProvider } from './src/core/provider/DeterministicProvider.js';
import { AssessmentOrchestrator } from './src/core/orchestrator/AssessmentOrchestrator.js';
import { ResumeAnalyzer } from './src/core/understanding/ResumeAnalyzer.js';
import { STRONG_RESUME, backendRole, sessionConfig } from './src/testSupport/fixtures.js';

console.log('Testing Service 1: Resume Analyzer...');
const analyzer = new ResumeAnalyzer();
const output = analyzer.analyze(STRONG_RESUME);
console.log('Education count:', output.education.length);
console.log('Skills count:', output.skills.length);
console.log('Experience count:', output.experience.length);
console.log('Projects count:', output.projects.length);
console.log('Certifications count:', output.certifications.length);
console.log('Candidate Level Hypothesis:', output.candidate_level_hypothesis);

const jsonOutput = analyzer.toJSON(output);
console.log('JSON valid:', JSON.parse(jsonOutput) !== null);

const audit = analyzer.audit(STRONG_RESUME, output);
console.log('Anti-hallucination audit passes:', audit.passes);

console.log('\nAll Service 1 checks passed.');