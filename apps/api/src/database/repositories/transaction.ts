import { Prisma, PrismaClient } from '@prisma/client';

export function isRetryableWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002');
}

export async function serializableTransaction<T>(
  client: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      lastError = error;
      if (!isRetryableWriteConflict(error) || attempt === maxAttempts) throw error;
    }
  }
  throw lastError;
}
