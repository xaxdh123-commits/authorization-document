import { ReviewController } from './review.controller';
import { REQUIRED_ABILITY } from '../auth/require-ability.decorator';
import { METHOD_METADATA } from '@nestjs/common/constants';

describe('ReviewController', () => {
  it('returns the persistent review queue', async () => {
    const service = { queue: jest.fn(async () => [{ id: 'c1' }]) } as any;
    await expect(new ReviewController(service).queue()).resolves.toEqual([{ id: 'c1' }]);
  });
  it('guards review, confirmation and PDF retry separately', () => {
    expect(Reflect.getMetadata(REQUIRED_ABILITY, ReviewController.prototype.queue)).toBe('REVIEW_ITEM');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, ReviewController.prototype.confirm)).toBe('REVIEW_CONFIRM');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, ReviewController.prototype.retry)).toBe('PDF_RETRY');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, ReviewController.prototype.rejectionMessage)).toBe('CASE_MANAGE_LINK');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, ReviewController.prototype.regenerateRejectionMessage)).toBe('CASE_MANAGE_LINK');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, ReviewController.prototype.assign)).toBe('CASE_ASSIGN_REVIEWER');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, ReviewController.prototype.reassign)).toBe('CASE_ASSIGN_REVIEWER');
  });

  it('exposes no HTTP action that can directly set COMPLETED', () => {
    const httpMethods = Object.getOwnPropertyNames(ReviewController.prototype)
      .filter((name) => name !== 'constructor' && Reflect.hasMetadata(METHOD_METADATA, (ReviewController.prototype as any)[name]));
    expect(httpMethods).not.toContain('complete');
    for (const name of httpMethods) expect((ReviewController.prototype as any)[name].toString()).not.toMatch(/\bCOMPLETED\b/);
  });
});
