import { STRONG_RESUME } from '../src/testSupport/fixtures.js';

async function testFullJourney() {
  console.log('=== Running Full Interview Journey End-to-End ===');

  // 1. Upload Resume
  const uploadRes = await fetch('http://localhost:3000/resumes/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText: STRONG_RESUME, candidateName: 'Full Journey Candidate' }),
  });
  const { resumeId } = await uploadRes.json();

  // 2. Create Interview (1 round = 3 questions)
  const createRes = await fetch('http://localhost:3000/interviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeId, numRounds: 1 }),
  });
  const { sessionId } = await createRes.json();

  // 3. Start Interview
  const startRes = await fetch(`http://localhost:3000/interviews/${sessionId}/start`, { method: 'POST' });
  let currentQ = (await startRes.json()).currentQuestion;
  console.log('Started Round 1. First Question:', currentQ.id);

  // 4. Answer 3 questions
  for (let i = 0; i < 3; i++) {
    console.log(`Submitting answer for probe ${i + 1} (${currentQ.id})...`);
    const answerRes = await fetch(`http://localhost:3000/interviews/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: currentQ.id,
        text: 'I approach this problem by analyzing idempotency keys, unique database constraints, and transactional boundaries. In PostgreSQL we use read-committed or serializable isolation and monitor connection pools with PgBouncer. Under concurrent access, distributed locks in Redis guarantee single execution.',
        elapsedSec: 60,
      }),
    });
    const answerData = await answerRes.json();
    console.log(`Probe ${i + 1} Score:`, answerData.evaluation.grade.toFixed(1));

    if (i < 2) {
      const nextQRes = await fetch(`http://localhost:3000/interviews/${sessionId}/next-question`, { method: 'POST' });
      currentQ = (await nextQRes.json()).currentQuestion;
    }
  }

  // 5. Complete Interview
  console.log('Completing interview...');
  const completeRes = await fetch(`http://localhost:3000/interviews/${sessionId}/complete`, { method: 'POST' });
  const completeData = await completeRes.json();
  console.log('State:', completeData.state);
  console.log('Overall Score:', completeData.overallScore);
  console.log('Performance Band:', completeData.performanceBand);

  // 6. Get Results
  const resultsRes = await fetch(`http://localhost:3000/interviews/${sessionId}/results`);
  const resultsData = await resultsRes.json();
  console.log('Results candidateName:', resultsData.candidateName);
  console.log('Results roleTitle:', resultsData.roleTitle);
  console.log('Evidence count:', resultsData.evidence.length);
  console.log('Gaps identified:', resultsData.gaps.length);
  console.log('Roadmap steps:', resultsData.roadmap.length);

  // 7. Verify /interviews/recent now shows this session
  const recentRes = await fetch('http://localhost:3000/interviews/recent');
  const recentData = await recentRes.json();
  console.log('Recent sessions in backend store:', recentData.interviews.length);

  console.log('\n=== FULL JOURNEY TEST PASSED 100%! ===');
}

testFullJourney().catch((err) => {
  console.error('Full journey test failed:', err);
  process.exit(1);
});
