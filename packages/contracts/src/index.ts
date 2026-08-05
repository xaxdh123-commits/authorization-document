import { z } from 'zod';
export type HealthStatus = 'ok' | 'degraded';
export const CaseStatusSchema = z.enum(['DRAFT','SUBMITTED','IN_REVIEW','COMPLETED']);
export const DataScopeSchema = z.enum(['SELF','DEPT','ALL']);
export const MaterialItemSchema = z.object({name:z.string().min(1), specification:z.string(), quantity:z.number().positive(), material:z.string(), craft:z.string()});
