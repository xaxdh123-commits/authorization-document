import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ChromiumPdfRenderer, type PdfContentInput } from '@auth/template-engine';
import { validateFileContent, type Storage } from '@auth/storage';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { STORAGE } from '../files/storage.provider';
import { prepareCanonicalPresignInput, type CanonicalPresignInput } from './presign-canonical';

export const PRESIGN_PREVIEW_SERVICE = Symbol('PRESIGN_PREVIEW_SERVICE');
export type PresignRenderResult = { bytes: Buffer; contentDigest: string; draftVersion: number; renderInput: PdfContentInput };
export interface PresignPreviewRenderer {
  prepare(input: { caseId: string; draftVersion?: number }): Promise<CanonicalPresignInput>;
  renderPrepared(input: CanonicalPresignInput): Promise<PresignRenderResult>;
  render(input: { caseId: string; draftVersion?: number }): Promise<PresignRenderResult>;
}
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const readAll = async (stream: Readable) => { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); };

@Injectable()
export class PresignPreviewService implements PresignPreviewRenderer {
  constructor(private readonly prisma: PrismaService, private readonly renderer: ChromiumPdfRenderer, @Inject(STORAGE) private readonly storage: Storage) {}

  prepare(input: { caseId: string; draftVersion?: number }): Promise<CanonicalPresignInput> {
    return this.prisma.db.$transaction((tx) => prepareCanonicalPresignInput(tx, input.caseId, input.draftVersion));
  }

  async renderPrepared(prepared: CanonicalPresignInput): Promise<PresignRenderResult> {
    const ast = plain(prepared.renderInput.ast) as any;
    const resolveImages = async (value: any): Promise<void> => {
      if (Array.isArray(value)) { for (const child of value) await resolveImages(child); return; }
      if (!value || typeof value !== 'object') return;
      if (value.type === 'image') {
        if (typeof value.source !== 'string') throw new BadRequestException('模板图片来源无效');
        if (value.source.startsWith('data:')) {
          const inline = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(value.source);
          if (!inline) throw new BadRequestException('模板内联图片格式无效');
          try { validateFileContent(Buffer.from(inline[2], 'base64'), inline[1]); }
          catch (error) { throw new BadRequestException('模板内联图片校验失败', { cause: error instanceof Error ? error : undefined }); }
          return;
        }
        if (/^(?:https?|file):/i.test(value.source)) throw new BadRequestException('模板图片不允许引用外部地址');
        const sourceKey = value.source;
        const match = prepared.imageResources.find((candidate) => candidate.id === sourceKey || candidate.fileId === sourceKey || candidate.requirementKey === sourceKey);
        if (!match || !['image/png', 'image/jpeg'].includes(match.mimeType)) throw new BadRequestException('模板图片对应的有效文件不存在');
        const bytes = await readAll(await this.storage.read(match.storageKey));
        try { validateFileContent(bytes, match.mimeType); }
        catch (error) { throw new BadRequestException('模板图片文件校验失败', { cause: error instanceof Error ? error : undefined }); }
        if(createHash('sha256').update(bytes).digest('hex')!==match.sha256)throw new BadRequestException('模板图片文件摘要校验失败');
        value.source = `data:${match.mimeType};base64,${bytes.toString('base64')}`;
        return;
      }
      for (const child of Object.values(value)) await resolveImages(child);
    };
    await resolveImages(ast);
    const renderInput: PdfContentInput = { ...prepared.renderInput, ast };
    const bytes = await this.renderer.render({ ...renderInput, contentDigest: prepared.contentDigest });
    return { bytes, contentDigest: prepared.contentDigest, draftVersion: prepared.draftVersion, renderInput };
  }

  async render(input: { caseId: string; draftVersion?: number }): Promise<PresignRenderResult> {
    return this.renderPrepared(await this.prepare(input));
  }
}
