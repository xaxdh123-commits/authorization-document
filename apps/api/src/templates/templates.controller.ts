import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { TemplateCreateSchema, TemplateUpdateSchema } from '@auth/contracts';
import { TemplateStore } from './template.store';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly store: TemplateStore = new TemplateStore()) {}
  @Get() list() { return this.store.list(); }
  @Post() create(@Body() body: unknown) { return this.store.create(TemplateCreateSchema.parse(body)); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) {
    try { return this.store.update(id, TemplateUpdateSchema.parse(body)); }
    catch { throw new NotFoundException('template not found'); }
  }
}
