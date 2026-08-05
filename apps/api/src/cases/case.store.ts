import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { CaseCreate } from '@auth/contracts';
import type { CaseStatus } from '@auth/contracts';

export type StoredCase = CaseCreate & {
  id: string;
  status: CaseStatus;
  accessToken: string;
  accessTokenExpiresAt: string;
  accessClosed: boolean;
  signingMode: 'STANDARD';
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class CaseStore {
  private readonly cases = new Map<string, StoredCase>();

  create(input: CaseCreate): StoredCase {
    const now = new Date().toISOString();
    const value: StoredCase = {
      ...input,
      id: `case-${this.cases.size + 1}`,
      status: 'DRAFT',
      accessToken: randomBytes(24).toString('base64url'),
      accessTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accessClosed: false,
      signingMode: 'STANDARD',
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(value.id, value);
    return value;
  }

  list(): StoredCase[] { return [...this.cases.values()]; }
  get(id: string): StoredCase | undefined { return this.cases.get(id); }
  byToken(token: string): StoredCase | undefined { return this.list().find((item) => item.accessToken === token); }

  updateStatus(item: StoredCase, status: CaseStatus): StoredCase {
    item.status = status;
    item.updatedAt = new Date().toISOString();
    return item;
  }

  closeAccess(item: StoredCase): StoredCase {
    item.accessClosed = true;
    item.updatedAt = new Date().toISOString();
    return item;
  }
}
