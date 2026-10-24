import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  InterviewStateMachine,
  InterviewState,
  InvalidStateTransitionError,
} from './InterviewStateMachine.js';
import { InMemorySessionStore, FileSessionStore } from './InterviewSessionStore.js';
import { DeterministicProvider } from '../provider/DeterministicProvider.js';
import { buildProfile, backendRole, STRONG_RESUME, sessionConfig } from '../../testSupport/fixtures.js';

describe('Section 17: Interview State Machine (Backend Ownership & Transitions)', () => {
  const provider = new DeterministicProvider();
  const profile = buildProfile(STRONG_RESUME);
  const role = backendRole();
  const config = sessionConfig(profile, role);
  const deps = { provider, seed: 42 };

  it('uses historical gap priorities for untested skills without fabricating skill evidence', async () => {
    const equalRole = { ...role, skills: role.skills.slice(0, 2).map((skill) => ({ ...skill, weight: 1 })) };
    const baseline = new InterviewStateMachine({ ...config, role: equalRole }, deps);
    baseline.prepare();
    const first = baseline.nextQuestion();
    const target = equalRole.skills.find((s) => s.skillId !== first.skillId)!.skillId;
    const personalized = new InterviewStateMachine({ ...config, role: equalRole, practicePriorities: [{ skillId: target, priority: 1, sourceSessionId: 'previous-completed' }] }, deps);
    personalized.prepare();
    expect(personalized.nextQuestion().skillId).toBe(target);
    expect(personalized.skillStates.every((s) => s.samples === 0 && s.confidence === 0)).toBe(true);
    await personalized.submitAnswer({ text: 'I do not know this concept yet.' });
    expect(personalized.skillStates.find((s) => s.skillId === target)?.samples).toBe(1);
    expect(personalized.nextQuestion().difficulty).toBeLessThanOrEqual(first.difficulty);
  });

  it('initializes in CREATED state with backend authoritative defaults', () => {
    const sm = new InterviewStateMachine(config, deps);

    expect(sm.state).toBe(InterviewState.CREATED);
    expect(sm.currentRound).toBe(1);
    expect(sm.maxRounds).toBe(config.numRounds);
    expect(sm.currentQuestion).toBeNull();
    expect(sm.currentDifficulty).toBe(5);
    expect(sm.questionHistory).toHaveLength(0);
    expect(sm.skillStates.length).toBeGreaterThan(0);
    expect(sm.timing.sessionStartedAt).toBeNull();
  });

  it('transitions CREATED → READY via prepare()', () => {
    const sm = new InterviewStateMachine(config, deps);
    sm.prepare();
    expect(sm.state).toBe(InterviewState.READY);
  });

  it('rejects illegal transitions with InvalidStateTransitionError', async () => {
    const sm = new InterviewStateMachine(config, deps);

    // Cannot submit answer in CREATED
    await expect(sm.submitAnswer({ text: 'test' })).rejects.toThrow(InvalidStateTransitionError);

    // Cannot advance round in CREATED
    expect(() => sm.advanceRound()).toThrow(InvalidStateTransitionError);

    // Cannot prepare twice
    sm.prepare();
    expect(() => sm.prepare()).toThrow(InvalidStateTransitionError);
  });

  it('runs complete lifecycle: CREATED → READY → IN_PROGRESS → EVALUATING → COMPLETED across rounds (1-4)', async () => {
    const multiRoundConfig = {
      ...config,
      numRounds: 2,
      roundConfig: { questionBudget: 2, maxSameSkillInRow: 2 },
    };
    const sm = new InterviewStateMachine(multiRoundConfig, deps);

    // 1. Prepare
    sm.prepare();
    expect(sm.state).toBe(InterviewState.READY);

    // 2. Next question → IN_PROGRESS
    const q1 = sm.nextQuestion();
    expect(sm.state).toBe(InterviewState.IN_PROGRESS);
    expect(sm.currentQuestion?.id).toBe(q1.id);
    expect(sm.timing.sessionStartedAt).not.toBeNull();
    expect(sm.timing.questionStartedAt).not.toBeNull();

    // 3. Submit Answer → EVALUATING
    const eval1 = await sm.submitAnswer({
      text: 'PostgreSQL MVCC uses xmin and xmax headers on row tuples.',
    });
    expect(sm.state).toBe(InterviewState.EVALUATING);
    expect(eval1.grade).toBeGreaterThanOrEqual(0);
    expect(sm.questionHistory).toHaveLength(1);

    // 4. Next question in Round 1
    const q2 = sm.nextQuestion();
    expect(sm.state).toBe(InterviewState.IN_PROGRESS);
    expect(sm.currentQuestion?.id).toBe(q2.id);

    // 5. Submit second answer (finishes Round 1 question budget)
    await sm.submitAnswer({
      text: 'Index scans use B-Trees for log(N) lookup complexity.',
    });
    expect(sm.state).toBe(InterviewState.EVALUATING);

    // 6. Advance to Round 2
    sm.advanceRound();
    expect(sm.state).toBe(InterviewState.IN_PROGRESS);
    expect(sm.currentRound).toBe(2);
    expect(sm.currentQuestion).toBeNull();

    // 7. Round 2 Questions
    sm.nextQuestion();
    await sm.submitAnswer({ text: 'Distributed consensus via Raft.' });
    sm.nextQuestion();

    // Final answer of final round automatically transitions to COMPLETED
    await sm.submitAnswer({ text: 'Event sourcing with Kafka partitions.' });
    expect(sm.state).toBe(InterviewState.COMPLETED);
  });

  it('preserves timing and progress correctly in public state for browser refresh', async () => {
    const sm = new InterviewStateMachine(config, deps);
    sm.prepare();
    const q = sm.nextQuestion();

    const publicState = sm.toPublicState();

    // Verify backend single source of truth
    expect(publicState.sessionId).toBe(sm.sessionId);
    expect(publicState.state).toBe(InterviewState.IN_PROGRESS);
    expect(publicState.currentRound).toBe(1);
    expect(publicState.currentQuestion?.id).toBe(q.id);
    expect(publicState.currentQuestion?.prompt).toBe(q.prompt);
    expect(publicState.timing.questionStartedAt).not.toBeNull();

    // CRITICAL ANTI-CHEATING CHECK:
    // Expected answer points and rubric hints MUST NOT be present in public state!
    expect((publicState.currentQuestion as any).expected_answer_points).toBeUndefined();
    expect((publicState.currentQuestion as any).hints).toBeUndefined();
    expect((publicState.currentQuestion as any).rubricHints).toBeUndefined();
  });

  it('increments integrity warnings once per incident and persists terminal state', () => {
    const sm = new InterviewStateMachine(config, deps);
    sm.prepare();
    sm.nextQuestion();
    const startedAt = sm.timing.sessionStartedAt!;
    const event = (eventId: string, offsetMs: number) => ({
      eventId,
      eventType: 'tab_hidden' as const,
      occurredAt: startedAt + offsetMs,
      durationMs: 5_000,
    });

    expect(sm.toPublicState().integrity.warningCount).toBe(0);
    expect(sm.recordIntegrityWarning(event('incident-one', 35_000)).warningCount).toBe(1);
    expect(sm.recordIntegrityWarning(event('incident-one', 35_000))).toMatchObject({ duplicate: true, warningCount: 1 });
    sm.recordIntegrityWarning({eventId:'visible-one',eventType:'tab_visible',occurredAt:startedAt+37000,durationMs:2000});
    expect(sm.recordIntegrityWarning(event('incident-two', 55_000)).warningCount).toBe(2);
    sm.recordIntegrityWarning({eventId:'visible-two',eventType:'tab_visible',occurredAt:startedAt+57000,durationMs:2000});
    const third = sm.recordIntegrityWarning(event('incident-three', 75_000));
    expect(third).toMatchObject({ warningCount: 3, terminated: true });
    expect(sm.state).toBe(InterviewState.TERMINATED_FOR_INTEGRITY);
    expect(sm.currentQuestion).toBeNull();
    expect(sm.toPublicState().integrity.terminatedAt).toBeTruthy();

    const snapshot = sm.serialize();
    const restored = InterviewStateMachine.deserialize(snapshot, deps);
    expect(restored.toPublicState().integrity.warningCount).toBe(3);
    expect(restored.state).toBe(InterviewState.TERMINATED_FOR_INTEGRITY);
    expect(restored.recordIntegrityWarning(event('incident-four', 95_000))).toMatchObject({ terminated: true, warningCount: 3 });
    expect(() => restored.nextQuestion()).toThrow(InvalidStateTransitionError);
  });

  it('suppresses overlapping continuous incidents and never penalizes technical observations', () => {
    const sm = new InterviewStateMachine(config, deps);
    sm.prepare(); sm.nextQuestion();
    const startedAt = sm.timing.sessionStartedAt!;
    expect(sm.recordIntegrityWarning({ eventId: 'one', eventType: 'tab_hidden', occurredAt: startedAt + 35_000, durationMs: 5000 }).warningCount).toBe(1);
    expect(sm.recordIntegrityWarning({ eventId: 'overlapping', eventType: 'tab_hidden', occurredAt: startedAt + 65_000, durationMs: 35_000 })).toMatchObject({ warningCount: 1, suppressed: true });
    expect(sm.recordIntegrityWarning({ eventId: 'device', eventType: 'camera_interrupted', occurredAt: startedAt + 70_000, durationMs: 5000 }).warningCount).toBe(1);
    sm.recordIntegrityWarning({eventId:'visible',eventType:'tab_visible',occurredAt:startedAt+72000,durationMs:2000});
    expect(sm.recordIntegrityWarning({ eventId: 'distinct', eventType: 'tab_hidden', occurredAt: startedAt + 90_000, durationMs: 5000 })).toMatchObject({ warningCount: 2, terminated: false });
  });

  it('keeps a continuous incident closed to further penalties across refresh and log pruning',()=>{
    let sm=new InterviewStateMachine(config,deps);sm.prepare();sm.nextQuestion();const start=sm.timing.sessionStartedAt!;
    const hidden=(id:string,at:number)=>({eventId:id,eventType:'tab_hidden' as const,occurredAt:start+at,durationMs:5000});
    expect(sm.recordIntegrityWarning(hidden('first',35000)).warningCount).toBe(1);
    const original=sm.serialize();
    const legacy=InterviewStateMachine.deserialize({...original,integrity:{warningCount:original.integrity!.warningCount,events:original.integrity!.events,terminatedAt:null,terminationReason:null}},deps);
    expect(legacy.recordIntegrityWarning(hidden('legacy-refresh',95000))).toMatchObject({warningCount:1,suppressed:true});
    sm=InterviewStateMachine.deserialize(sm.serialize(),deps);
    expect(sm.recordIntegrityWarning(hidden('new-id-after-refresh',95000))).toMatchObject({warningCount:1,suppressed:true});
    const snapshot=sm.serialize();sm=InterviewStateMachine.deserialize({...snapshot,integrity:{...snapshot.integrity!,events:[]}},deps);
    expect(sm.recordIntegrityWarning(hidden('after-history-pruned',3600000))).toMatchObject({warningCount:1,suppressed:true});
    expect(sm.state).not.toBe(InterviewState.TERMINATED_FOR_INTEGRITY);
  });

  it('requires valid stable recovery and applies cooldown to a newly opened incident',()=>{
    const sm=new InterviewStateMachine(config,deps);sm.prepare();sm.nextQuestion();const start=sm.timing.sessionStartedAt!;
    const event=(id:string,type:'tab_hidden'|'tab_visible',at:number,durationMs:number)=>({eventId:id,eventType:type,occurredAt:start+at,durationMs});
    sm.recordIntegrityWarning(event('first','tab_hidden',35000,5000));
    sm.recordIntegrityWarning(event('short-visible','tab_visible',36000,1000));
    expect(sm.recordIntegrityWarning(event('still-same','tab_hidden',40000,5000)).warningCount).toBe(1);
    sm.recordIntegrityWarning(event('visible','tab_visible',42000,2000));
    expect(sm.recordIntegrityWarning(event('cooldown-hidden','tab_hidden',48000,5000))).toMatchObject({warningCount:1,suppressed:true});
    expect(sm.integrityEvents.at(-1)?.policyDecision).toBe('cooldown');
    expect(sm.recordIntegrityWarning(event('cooldown-continuation','tab_hidden',70000,5000)).warningCount).toBe(1);
    sm.recordIntegrityWarning(event('second-recovery','tab_visible',72000,2000));
    expect(sm.recordIntegrityWarning(event('new-hidden','tab_hidden',80000,5000)).warningCount).toBe(2);
  });

  it('never counts uncertain, visual or technical observations as confirmed violations',()=>{
    const sm=new InterviewStateMachine(config,deps);sm.prepare();sm.nextQuestion();const start=sm.timing.sessionStartedAt!;
    for(const type of ['gaze_away','head_turned','face_absent','tracking_unreliable','hand_tracking_changed','camera_interrupted','vision_pipeline_error'] as const){
      expect(sm.recordIntegrityWarning({eventId:type,eventType:type,occurredAt:start+35000,durationMs:30000,confidence:.99}).warningCount).toBe(0);
    }
    expect(sm.recordIntegrityWarning({eventId:'low-confidence',eventType:'tab_hidden',occurredAt:start+40000,durationMs:5000,confidence:.2}).warningCount).toBe(0);
    expect(sm.recordIntegrityWarning({eventId:'technical',eventType:'tab_hidden',occurredAt:start+40000,durationMs:5000,severity:'technical'}).warningCount).toBe(0);
    expect(sm.recordIntegrityWarning({eventId:'short',eventType:'tab_hidden',occurredAt:start+40000,durationMs:1000}).warningCount).toBe(0);
  });

  it('purges old event metadata without reviving a terminated persisted interview', async () => {
    const directory = path.resolve(process.cwd(), '.test_integrity_retention');
    const store = new FileSessionStore(deps, directory);
    const sm = new InterviewStateMachine(config, deps);
    sm.prepare(); sm.nextQuestion();
    const startedAt = sm.timing.sessionStartedAt!;
    for (let index = 0; index < 3; index++) { if(index)sm.recordIntegrityWarning({eventId:`recovery-${index}`,eventType:'tab_visible',occurredAt:startedAt+17000+index*20000,durationMs:2000}); sm.recordIntegrityWarning({ eventId: `incident-${index}`, eventType: 'tab_hidden', occurredAt: startedAt + 35_000 + index * 20_000, durationMs: 5000 }); }
    const snapshot = sm.serialize();
    const old = InterviewStateMachine.deserialize({ ...snapshot, integrity: { ...snapshot.integrity!, events: snapshot.integrity!.events.map((event) => ({ ...event, occurredAt: Date.now() - 31 * 86400000 })) } }, deps);
    try {
      await store.save(old);
      const restored = (await store.load(sm.sessionId))!;
      expect(restored.state).toBe(InterviewState.TERMINATED_FOR_INTEGRITY);
      expect(restored.toPublicState().integrity.warningCount).toBe(3);
      expect(restored.integrityEvents).toHaveLength(0);
      expect(() => restored.nextQuestion()).toThrow(InvalidStateTransitionError);
    } finally { await store.delete(sm.sessionId); fs.rmdirSync(directory); }
  });

  it('survives page refresh / reconnect via serialize() and deserialize()', async () => {
    const sm = new InterviewStateMachine(config, deps);
    sm.prepare();
    sm.nextQuestion();
    await sm.submitAnswer({ text: 'ACID transactions guarantee consistency.' });
    const q2 = sm.nextQuestion();

    // Simulate page refresh: serialize to snapshot, then restore
    const snapshot = sm.serialize();
    const restored = InterviewStateMachine.deserialize(snapshot, deps);

    expect(restored.sessionId).toBe(sm.sessionId);
    expect(restored.state).toBe(InterviewState.IN_PROGRESS);
    expect(restored.currentRound).toBe(sm.currentRound);
    expect(restored.currentQuestion?.id).toBe(q2.id);
    expect(restored.questionHistory).toHaveLength(1);
    expect(restored.skillStates).toEqual(sm.skillStates);

    // Can continue seamlessly after restore
    const eval2 = await restored.submitAnswer({ text: 'Read committed prevents dirty reads.' });
    expect(eval2.grade).toBeGreaterThanOrEqual(0);
    expect(restored.questionHistory).toHaveLength(2);
  });

  it('InMemorySessionStore saves, loads, lists, and deletes sessions', async () => {
    const store = new InMemorySessionStore(deps);
    const sm = new InterviewStateMachine(config, deps);
    sm.prepare();
    sm.nextQuestion();

    await store.save(sm);
    expect(await store.has(sm.sessionId)).toBe(true);

    const loaded = await store.load(sm.sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe(sm.sessionId);
    expect(loaded?.state).toBe(InterviewState.IN_PROGRESS);

    const list = await store.list();
    expect(list).toContain(sm.sessionId);

    await store.delete(sm.sessionId);
    expect(await store.has(sm.sessionId)).toBe(false);
  });

  it('FileSessionStore persists session to disk surviving server restart', async () => {
    const tempDir = path.resolve(process.cwd(), '.test_sessions');
    const fileStore = new FileSessionStore(deps, tempDir);
    const sm = new InterviewStateMachine(config, deps);
    sm.prepare();
    const q = sm.nextQuestion();

    await fileStore.save(sm);
    expect(await fileStore.has(sm.sessionId)).toBe(true);

    // Reconnect simulation: new store instance reading from disk
    const reconnectedStore = new FileSessionStore(deps, tempDir);
    const loaded = await reconnectedStore.load(sm.sessionId);

    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe(sm.sessionId);
    expect(loaded?.currentQuestion?.id).toBe(q.id);

    // Cleanup
    await fileStore.delete(sm.sessionId);
    expect(await fileStore.has(sm.sessionId)).toBe(false);
    if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
  });
});
