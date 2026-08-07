import { BadRequestException } from '@nestjs/common';

export const ORDINARY_SIGNING_DISCLAIMER = '当前为普通电子签署，不等同于第三方可靠电子签名。';
export const ORDINARY_SIGNING_DECLARATION_V1 = 'ORDINARY_SIGNING_DECLARATION_V1';

export function safeAttachmentDisposition(originalName: string): string {
  const cleaned = originalName.replace(/[\r\n\u0000-\u001f\u007f]/g, '').slice(0, 180);
  const extension = /\.(pdf|png|jpe?g)$/i.exec(cleaned)?.[0]?.toLowerCase() ?? '';
  const fallback = `download${extension}`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(cleaned || fallback)}`;
}

type Slot = { slotId:string; page:number; x:number; y:number; width:number; height:number; required:boolean };
type Position = { slotId:string; page:number; x:number; y:number; width:number; height:number };
export type SigningCommand = { mode:'HANDWRITTEN'|'SEAL'; signatureResourceId:string; signatureResourceVersion:number; positions:Position[]; declaration:true; sealOriginalFileVersionId?:string };

export function validateSigningCommand(raw: unknown, slots: Slot[]): SigningCommand {
  if (!raw || typeof raw !== 'object') throw new BadRequestException('签署请求无效');
  const value = raw as Record<string, unknown>;
  const allowed = new Set(['mode','signatureResourceId','signatureResourceVersion','positions','declaration','sealOriginalFileVersionId']);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new BadRequestException('签署请求包含不受信任字段');
  if (!['HANDWRITTEN','SEAL'].includes(String(value.mode)) || typeof value.signatureResourceId !== 'string' || !Number.isInteger(value.signatureResourceVersion) || Number(value.signatureResourceVersion) < 1) throw new BadRequestException('请选择一种有效签署方式');
  if (value.declaration !== true) throw new BadRequestException('声明只能由客户确认，版本由服务器固定');
  if (!Array.isArray(value.positions)) throw new BadRequestException('签署位置无效');
  const required = slots.filter((slot) => slot.required);
  const positions = value.positions as Position[];
  if (required.some((slot) => positions.filter((position) => position?.slotId === slot.slotId).length !== 1) || positions.length !== required.length) throw new BadRequestException('必须覆盖全部甲方签署位置');
  for (const position of positions) {
    if (!position || Object.keys(position).some((key) => !['slotId','page','x','y','width','height'].includes(key))) throw new BadRequestException('签署位置包含不受信任字段');
    const slot = required.find((candidate) => candidate.slotId === position.slotId);
    if (!slot || ![position.page,position.x,position.y,position.width,position.height].every(Number.isFinite) || position.page !== slot.page || position.width <= 0 || position.height <= 0 || position.x < slot.x || position.y < slot.y || position.x + position.width > slot.x + slot.width || position.y + position.height > slot.y + slot.height) throw new BadRequestException('签署位置超出签署区域');
  }
  return value as SigningCommand;
}

export function validateSigningResourceBinding(mode:'HANDWRITTEN'|'SEAL', resource:{purpose:string;originalFileVersionId?:string|null}, expectedOriginalId?:string):void {
  if (mode==='HANDWRITTEN' && resource.purpose!=='HANDWRITTEN') throw new BadRequestException('签署方式与资源类型不一致');
  if (mode==='SEAL' && !['SEAL_ORIGINAL','SEAL_PROCESSED'].includes(resource.purpose)) throw new BadRequestException('签署方式与资源类型不一致');
  if (mode==='SEAL' && resource.purpose==='SEAL_PROCESSED' && (!expectedOriginalId || resource.originalFileVersionId!==expectedOriginalId)) throw new BadRequestException('印章原图与处理结果关系无效');
}
