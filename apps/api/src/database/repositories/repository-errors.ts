export class DraftVersionConflictError extends Error {
  readonly code = 'DRAFT_VERSION_CONFLICT';
  readonly status = 409;
  constructor(readonly expectedVersion: number, readonly currentVersion: number) {
    super('DRAFT_VERSION_CONFLICT');
  }
}

export class CaseStatusConflictError extends Error {
  readonly code = 'CASE_STATUS_CONFLICT';
  readonly status = 409;
  constructor() { super('CASE_STATUS_CONFLICT'); }
}
