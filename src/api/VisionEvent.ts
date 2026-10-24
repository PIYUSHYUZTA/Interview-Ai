import { z } from 'zod';
import { VISION_TRANSITION_TYPES, type IntegrityEventInput } from '../core/session/IntegrityPolicy.js';

export const VisionEventSchema = z.object({
  sessionId: z.string().min(1).max(200), eventId: z.string().uuid(), eventType: z.enum(VISION_TRANSITION_TYPES),
  occurredAt: z.number().int().nonnegative(), durationMs: z.number().int().min(0).max(3600000),
  confidence: z.number().min(0).max(1).nullable(), severity: z.enum(['info','technical']),
  details: z.object({source:z.literal('vision'),signal:z.string().max(40),trackingState:z.string().max(200),phase:z.enum(['observed','recovered','technical'])}),
});

/** Worker-only boundary; browsers cannot submit vision events through integrity-events. */
export function eligibleVisionEvent(event: z.infer<typeof VisionEventSchema>, sessionId: string, now: number): boolean {
  return event.sessionId === sessionId && event.occurredAt <= now+5000 && event.occurredAt >= now-60000
    && (event.confidence === null || event.confidence >= .7);
}

export function technicalVisionEvent(sessionId: string, eventId: string, now: number, recovered: boolean, durationMs = 0): IntegrityEventInput {
  return {sessionId,eventId,eventType:recovered?'vision_pipeline_recovered':'vision_pipeline_error',occurredAt:now,
    durationMs,confidence:null,severity:'technical',details:{source:'backend',signal:'vision_pipeline',trackingState:recovered?'available':'unavailable',phase:recovered?'recovered':'technical'}};
}
