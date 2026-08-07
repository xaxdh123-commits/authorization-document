import { z } from 'zod';
import { SignatureModeSchema } from './template';

export const SignaturePositionSchema = z.object({
  slotId: z.string().min(1),
  page: z.number().int().positive(),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
}).strict();

export const SigningResourcePurposeSchema = z.enum(['HANDWRITTEN','SEAL_ORIGINAL','SEAL_PROCESSED']);
export const PublicSignatureSlotSchema = SignaturePositionSchema.extend({required:z.boolean()}).strict();
export const PublicSigningCommandSchema = z.object({
  mode:z.enum(['HANDWRITTEN','SEAL']),signatureResourceId:z.string().min(1),signatureResourceVersion:z.number().int().positive(),positions:z.array(SignaturePositionSchema),declaration:z.literal(true),sealOriginalFileVersionId:z.string().min(1).optional(),
}).strict().superRefine((command,context)=>{if(command.mode==='SEAL'&&!command.sealOriginalFileVersionId)context.addIssue({code:z.ZodIssueCode.custom,path:['sealOriginalFileVersionId'],message:'seal original is required'});if(command.mode==='HANDWRITTEN'&&command.sealOriginalFileVersionId)context.addIssue({code:z.ZodIssueCode.custom,path:['sealOriginalFileVersionId'],message:'handwritten mode cannot use a seal original'});});
export const PublicCurrentFileSchema=z.object({fileId:z.string().min(1),fileVersionId:z.string().min(1),version:z.number().int().positive(),name:z.string().min(1),mimeType:z.string().min(1),sizeBytes:z.number().int().nonnegative(),createdAt:z.string().datetime().optional(),downloadUrl:z.string().min(1).optional()}).strict();
export const PublicCurrentFilesResponseSchema=z.object({totalBytes:z.number().int().nonnegative(),groups:z.array(z.object({requirementKey:z.string().min(1),requirementVersionId:z.string().min(1),label:z.string().min(1),files:z.array(PublicCurrentFileSchema)}).strict())}).strict();

export const SigningDeclarationSchema = z.object({
  version: z.string().min(1),
  accepted: z.literal(true),
}).strict();

/**
 * The first release has exactly one Party A signer. One resource version is
 * applied to every required Party A slot; server evidence is added separately.
 */
export const SigningPayloadSchema = z.object({
  mode: SignatureModeSchema,
  signatureResourceId: z.string().min(1),
  signatureResourceVersion: z.number().int().positive(),
  positions: z.array(SignaturePositionSchema).min(1),
  declaration: SigningDeclarationSchema,
}).strict();

export const SigningRecordSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  version: z.number().int().positive(),
  payload: SigningPayloadSchema,
  preSignPdfFileId: z.string().min(1),
  preSignPdfSha256: z.string().regex(/^[a-f0-9]{64}$/),
  signedAt: z.string().datetime(),
  clientIp: z.string().min(1),
  userAgent: z.string().min(1),
  valid: z.boolean(),
}).strict().readonly();

export type SignaturePosition = z.infer<typeof SignaturePositionSchema>;
export type SigningResourcePurpose = z.infer<typeof SigningResourcePurposeSchema>;
export type PublicSignatureSlot = z.infer<typeof PublicSignatureSlotSchema>;
export type PublicSigningCommand = z.infer<typeof PublicSigningCommandSchema>;
export type PublicCurrentFilesResponse = z.infer<typeof PublicCurrentFilesResponseSchema>;
export type SigningPayload = z.infer<typeof SigningPayloadSchema>;
export type SigningRecord = z.infer<typeof SigningRecordSchema>;
