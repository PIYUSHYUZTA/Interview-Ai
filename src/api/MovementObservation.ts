import { z } from 'zod';

const position = z.array(z.number().finite().min(-.1).max(1.1)).length(2);
const pattern = {
  sustainedMovementMs: z.number().nonnegative(), movementEpisodes: z.number().int().min(0).max(60),
  repeatedMovement: z.boolean(), sustainedMovement: z.boolean(),
};
const handedness = z.enum(['left','right','unknown']);
export const MovementObservationSchema = z.object({
  handTracks: z.array(z.object({
    trackId: z.number().int().positive(), handedness, handednessScore: z.number().min(0).max(1).nullable(),
    state: z.enum(['visible','partial']), transition: z.enum(['entered','continued','recovered']),
    reliable: z.boolean(), landmarkConfidence: z.null(), position,
    landmarks: z.array(position).length(21), movement: z.number().nonnegative().nullable(),
    relativeToFace: z.array(z.number().finite()).length(2).nullable(),
    gesture: z.enum(['open_fingers','curled_fingers','mixed_fingers','unavailable']), ...pattern,
  })).max(2),
  lostHands: z.array(z.object({trackId:z.number().int().positive(),handedness,state:z.enum(['tracking_lost','not_visible']),missingForMs:z.number().nonnegative()})).max(4),
  rejectedHands: z.number().int().min(0).max(2),
  body: z.object({
    state: z.enum(['visible','outside_useful_area','tracking_lost','unavailable','ambiguous']), reliable:z.boolean(),
    center: z.array(z.number().finite()).length(2).nullable(), landmarks:z.array(z.object({index:z.number().int().min(0).max(32),position:z.array(z.number().finite()).length(2),visibility:z.number().min(0).max(1)})).max(9),
    movement:z.number().nonnegative().nullable(), positionShift:z.number().nonnegative().nullable(),
    shoulderTiltDegrees:z.number().min(-180).max(180).nullable(), outsideUsefulArea:z.boolean(),
    visibility:z.number().min(0).max(1).nullable(),unreliableForMs:z.number().nonnegative(),...pattern,
  }),
  visiblePoseCount:z.number().int().min(0).max(3),additionalPersonObserved:z.boolean(),
  coordinateSystem:z.literal('unmirrored-camera'),method:z.literal('sampled-landmark-movement'),interpretation:z.literal('neutral-observation'),
});
