import { describe, expect, it } from 'vitest';
import { VisionEventSchema, eligibleVisionEvent } from './VisionEvent.js';

describe('worker event boundary', () => {
  const now=1700000000000;
  const event={sessionId:'session',eventId:crypto.randomUUID(),eventType:'tracking_lost',occurredAt:now,durationMs:2000,confidence:null,severity:'info',details:{source:'vision',signal:'face',trackingState:'TRACKING_LOST',phase:'observed'}};
  it('accepts unknown confidence honestly and rejects fabricated schema fields/types', () => {
    const parsed=VisionEventSchema.parse(event);
    expect(eligibleVisionEvent(parsed,'session',now)).toBe(true);
    expect(VisionEventSchema.safeParse({...event,eventType:'face_verified'}).success).toBe(false);
    expect(VisionEventSchema.safeParse({...event,confidence:4}).success).toBe(false);
    expect(VisionEventSchema.safeParse({...event,durationMs:-1}).success).toBe(false);
  });
  it('rejects wrong sessions, stale/future timestamps and low reported confidence', () => {
    const parsed=VisionEventSchema.parse(event);
    expect(eligibleVisionEvent(parsed,'other',now)).toBe(false);
    expect(eligibleVisionEvent({...parsed,occurredAt:now-61000},'session',now)).toBe(false);
    expect(eligibleVisionEvent({...parsed,occurredAt:now+6000},'session',now)).toBe(false);
    expect(eligibleVisionEvent({...parsed,confidence:.4},'session',now)).toBe(false);
  });
  it('enforces exact confidence and freshness boundaries without inventing detector confidence', () => {
    const parsed=VisionEventSchema.parse(event);
    for (const confidence of [null,.7,1]) expect(eligibleVisionEvent({...parsed,confidence},'session',now)).toBe(true);
    expect(eligibleVisionEvent({...parsed,confidence:.6999},'session',now)).toBe(false);
    for (const occurredAt of [now-60000,now+5000]) expect(eligibleVisionEvent({...parsed,occurredAt},'session',now)).toBe(true);
    for (const occurredAt of [now-60001,now+5001]) expect(eligibleVisionEvent({...parsed,occurredAt},'session',now)).toBe(false);
  });
});
