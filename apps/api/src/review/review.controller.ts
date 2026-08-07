import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AbilityGuard } from '../auth/ability.guard';
import type { RequestAuthContext } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { ReviewService } from './review.service';
type AuthRequest = { auth: RequestAuthContext };

@Controller(['review', 'reviews'])
@UseGuards(AbilityGuard)
export class ReviewController {
  constructor(private readonly service: ReviewService) {}
  @RequireAbility('REVIEW_ITEM') @Get() queue() { return this.service.queue(); }
  @RequireAbility('REVIEW_ITEM') @Get('queue') queueAlias() { return this.service.queue(); }
  @RequireAbility('REVIEW_ITEM') @Get(':id') detail(@Param('id') id: string) { return this.service.detail(id); }
  @RequireAbility('REVIEW_ITEM') @Post(':id/claim') claim(@Param('id') id: string, @Req() request: AuthRequest) { return this.service.claim(id, request.auth.user.userId); }
  @RequireAbility('CASE_ASSIGN_REVIEWER') @Post(':id/assign') assign(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.assign(id, body.reviewerUserId, request.auth.user.userId); }
  @RequireAbility('CASE_ASSIGN_REVIEWER') @Post(':id/reassign') reassign(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.assign(id, body.reviewerUserId, request.auth.user.userId, body.reason); }
  @RequireAbility('REVIEW_ITEM') @Post(':id/items/:requirementVersionId') item(@Param('id') id: string, @Param('requirementVersionId') requirementVersionId: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.reviewItem(id, requirementVersionId, body.decision, body.reason, request.auth.user.userId); }
  @RequireAbility('REVIEW_CONFIRM') @Post(':id/confirm') confirm(@Param('id') id: string, @Req() request: AuthRequest) { return this.service.confirm(id, request.auth.user.userId); }
  @RequireAbility('PDF_RETRY') @Post(':id/retry-pdf') retry(@Param('id') id: string, @Req() request: AuthRequest) { return this.service.retryPdf(id, request.auth.user.userId); }
  @RequireAbility('CASE_MANAGE_LINK') @Post(':id/rejection-message') rejectionMessage(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.copyRejectionMessage(id, request.auth.user.userId, body?.publicBaseUrl); }
  @RequireAbility('CASE_MANAGE_LINK') @Post(':id/rejection-message/regenerate') regenerateRejectionMessage(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.regenerateRejectionMessage(id, request.auth.user.userId, body); }
}
