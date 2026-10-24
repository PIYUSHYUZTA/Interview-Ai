import path from 'node:path';
import { z } from 'zod';

const origin = z.string().url().refine((value) => { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && u.origin === value; }, 'Use an exact HTTP(S) origin without a trailing slash.');
export const ServiceConfigSchema = z.object({
  port: z.coerce.number().int().min(0).max(65535).default(3000),
  host: z.string().min(1).default('127.0.0.1'),
  storage: z.enum(['file', 'sqlite']).default('file'),
  providerMode: z.enum(['deterministic', 'auto', 'live']).default('deterministic'),
  dataDirectory: z.string().min(1),
  allowedOrigins: z.array(origin).default(['http://localhost:5173', 'http://127.0.0.1:5173']),
  providerTimeoutMs: z.coerce.number().int().min(1000).max(120000).default(30000),
  faceReadinessRequired: z.boolean().default(false),
  visionTimeoutMs: z.coerce.number().int().min(1000).max(120000).default(20000),
  visionNoticeMs: z.coerce.number().int().min(5000).max(120000).default(15000),
  visualDirectionReviewEnabled: z.boolean().default(true),
  visionPositionThreshold: z.coerce.number().min(.05).max(.8).default(.15),
  authAttemptsPerWindow: z.coerce.number().int().min(1).max(1000).default(30),
  authWindowMs: z.coerce.number().int().min(1000).max(86400000).default(900000),
  trustProxy: z.boolean().default(false),
});
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;
export function serviceConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  return ServiceConfigSchema.parse({ port: env.PORT, host: env.API_HOST, storage: env.INTERVIEW_STORAGE,
    providerMode: env.INTERVIEW_PROVIDER, dataDirectory: path.resolve(env.INTERVIEW_DATA_DIR ?? '.data'),
    allowedOrigins: env.INTERVIEW_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
    visualDirectionReviewEnabled: env.PROCTORING_DIRECTION_REVIEW_ENABLED !== 'false', faceReadinessRequired: env.PROCTORING_FACE_CHECK_REQUIRED === 'true', visionNoticeMs: env.PROCTORING_NOTICE_MS, visionPositionThreshold: env.PROCTORING_POSITION_THRESHOLD, providerTimeoutMs: env.AI_HTTP_TIMEOUT_MS, visionTimeoutMs: env.PROCTORING_TIMEOUT_MS, authAttemptsPerWindow: env.AUTH_ATTEMPTS_PER_WINDOW, authWindowMs: env.AUTH_WINDOW_MS, trustProxy: env.TRUST_PROXY === 'true' });
}
