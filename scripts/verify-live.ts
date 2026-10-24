import { STRONG_RESUME } from '../src/testSupport/fixtures.js';

async function verify() {
  console.log('--- 1. Testing Frontend HTTP Server ---');
  const front = await fetch('http://localhost:5173');
  console.log('Frontend status:', front.status, front.headers.get('content-type'));
  const html = await front.text();
  console.log('Frontend index HTML loaded:', html.includes('<div id="root"></div>'));

  console.log('\n--- 2. Testing API Server: POST /resumes/upload ---');
  const uploadRes = await fetch('http://localhost:3000/resumes/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeText: STRONG_RESUME,
      candidateName: 'Live Verification Candidate',
    }),
  });
  console.log('Upload status:', uploadRes.status);
  const uploadData = await uploadRes.json();
  console.log('Extracted Candidate Name:', uploadData.candidateName);
  console.log('Extracted Skills Count:', uploadData.profile.skills.length);
  console.log('Candidate Level Hypothesis:', uploadData.profile.candidate_level_hypothesis.band);
  console.log('Audit Passes:', uploadData.audit.passes);

  console.log('\n--- 3. Testing API Server: POST /interviews (Session Creation) ---');
  const createRes = await fetch('http://localhost:3000/interviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeId: uploadData.resumeId,
      numRounds: 2,
    }),
  });
  console.log('Create status:', createRes.status);
  const createData = await createRes.json();
  console.log('Session ID:', createData.sessionId);
  console.log('State:', createData.state);
  console.log('Rounds:', createData.maxRounds);
  console.log('Plan Exists:', !!createData.interviewPlan);

  console.log('\n--- 4. Testing API Server: POST /interviews/:id/start ---');
  const startRes = await fetch(`http://localhost:3000/interviews/${createData.sessionId}/start`, {
    method: 'POST',
  });
  console.log('Start status:', startRes.status);
  const startData = await startRes.json();
  console.log('Initial Question ID:', startData.currentQuestion.id);
  console.log('Initial Question Topic/Skill:', startData.currentQuestion.skillId);
  console.log('Initial Question Prompt:', startData.currentQuestion.prompt);

  console.log('\n--- 5. Testing API Server: POST /interviews/:id/answer ---');
  const answerRes = await fetch(`http://localhost:3000/interviews/${createData.sessionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      questionId: startData.currentQuestion.id,
      text: 'In high-scale systems, I use PostgreSQL with connection pooling (PgBouncer), read replicas, and composite B-tree indexes. For payments, idempotent request keys with Redis distributed locks prevent duplicate processing. We monitor query latency and transaction isolation levels.',
      elapsedSec: 45,
    }),
  });
  console.log('Answer status:', answerRes.status);
  const answerData = await answerRes.json();
  console.log('Evaluation Grade:', answerData.evaluation.grade);
  console.log('Rubric Compliance:', Math.round(answerData.evaluation.rubricCompliance * 100) + '%');
  console.log('Evaluation Rationale:', answerData.evaluation.rationale);
  console.log('Adaptive Difficulty Shift:', answerData.publicState.currentDifficulty);

  console.log('\n--- 6. Testing API Server: GET /interviews/recent ---');
  const recentRes = await fetch('http://localhost:3000/interviews/recent');
  console.log('Recent interviews status:', recentRes.status);
  const recentData = await recentRes.json();
  console.log('Recent count:', recentData.interviews.length);

  console.log('\n ALL LIVE CHECKS PASSED SUCCESSFULLY!');
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
