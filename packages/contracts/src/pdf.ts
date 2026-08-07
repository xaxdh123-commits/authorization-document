import { z } from 'zod';

export const PdfTaskStatusSchema = z.enum(['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED']);

export const PdfTaskCreateSchema = z.object({
  caseId: z.string().min(1),
  templateVersionId: z.string().min(1),
  dataSnapshotVersion: z.number().int().positive(),
  signatureVersion: z.number().int().positive(),
}).strict();

export type PdfTaskIdentity = z.infer<typeof PdfTaskCreateSchema>;

export function createPdfTaskIdempotencyKey(identity: PdfTaskIdentity): string {
  return JSON.stringify([
    'pdf-task-v1',
    identity.caseId,
    identity.templateVersionId,
    identity.dataSnapshotVersion,
    identity.signatureVersion,
  ]);
}

const PdfTaskIdentitySchema = PdfTaskCreateSchema.extend({
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const PdfTaskSchema = z.discriminatedUnion('status', [
  PdfTaskIdentitySchema.extend({ status: z.literal('QUEUED') }).strict(),
  PdfTaskIdentitySchema.extend({ status: z.literal('PROCESSING') }).strict(),
  PdfTaskIdentitySchema.extend({
    status: z.literal('SUCCEEDED'),
    outputFileId: z.string().min(1),
    outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  PdfTaskIdentitySchema.extend({
    status: z.literal('FAILED'),
    failureCode: z.string().min(1),
    failureMessage: z.string().min(1),
  }).strict(),
]).superRefine((task, context) => {
  if (task.attempts > task.maxAttempts) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['attempts'], message: 'attempts cannot exceed maxAttempts' });
  }
  if (task.idempotencyKey !== createPdfTaskIdempotencyKey(task)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['idempotencyKey'], message: 'idempotencyKey does not match task identity' });
  }
});

export const PdfRetrySchema = z.object({ caseId: z.string().min(1), reason: z.string().trim().min(1).optional() }).strict();

export type PdfTaskStatus = z.infer<typeof PdfTaskStatusSchema>;
export type PdfTaskCreate = z.infer<typeof PdfTaskCreateSchema>;
export type PdfTask = z.infer<typeof PdfTaskSchema>;
export type PdfRetry = z.infer<typeof PdfRetrySchema>;

type AssertPdfType<T extends true> = T;
type IsExactPdfType<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type _PdfSuccessIsDiscriminated = AssertPdfType<IsExactPdfType<Extract<PdfTask, { status: 'SUCCEEDED' }>, never> extends false ? true : false>;
type _PdfSuccessOutputIsRequired = AssertPdfType<IsExactPdfType<Extract<PdfTask, { status: 'SUCCEEDED' }>['outputFileId'], string>>;
type _PdfFailureDetailsAreRequired = AssertPdfType<IsExactPdfType<Extract<PdfTask, { status: 'FAILED' }>['failureCode'], string>>;
type _QueuedTaskHasNoOutput = AssertPdfType<IsExactPdfType<'outputFileId' extends keyof Extract<PdfTask, { status: 'QUEUED' }> ? true : false, false>>;
