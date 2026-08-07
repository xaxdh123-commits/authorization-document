import { z } from 'zod';
import { CatalogVersionStatusSchema, RequirementDefinitionSchema } from './requirement';

export const SignatureModeSchema = z.enum(['HANDWRITTEN', 'STAMP_UPLOAD']);
export const TextAlignSchema = z.enum(['left', 'center', 'right', 'justify']);

export const TemplateStyleSchema = z.object({
  fontFamily: z.string().min(1).optional(),
  fontSize: z.number().positive().optional(),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).optional(),
  color: z.string().min(1).optional(),
  backgroundColor: z.string().min(1).optional(),
  textAlign: TextAlignSchema.optional(),
  lineHeight: z.number().positive().optional(),
  paragraphSpacing: z.number().nonnegative().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  marginTop: z.number().nonnegative().optional(),
  marginRight: z.number().nonnegative().optional(),
  marginBottom: z.number().nonnegative().optional(),
  marginLeft: z.number().nonnegative().optional(),
}).strict();

export type TemplateStyle = z.infer<typeof TemplateStyleSchema>;

type StyledTemplateNode = { styles?: TemplateStyle };
export type TemplateHeadingNode = StyledTemplateNode & { type: 'heading'; level: 1 | 2 | 3; children: TemplateNode[] };
export type TemplateParagraphNode = StyledTemplateNode & { type: 'paragraph'; children: TemplateNode[] };
export type TemplateTextNode = StyledTemplateNode & { type: 'text'; text: string };
export type TemplateImageNode = StyledTemplateNode & { type: 'image'; source: string; alt: string };
export type TemplateTableCell = StyledTemplateNode & { children: TemplateNode[] };
export type TemplateTableNode = StyledTemplateNode & { type: 'table'; rows: TemplateTableCell[][] };
export type TemplateLoopTableColumn = StyledTemplateNode & { header: string; variable: string };
export type TemplateLoopTableNode = StyledTemplateNode & { type: 'loopTable'; source: 'materials'; columns: TemplateLoopTableColumn[] };
export type TemplateVariableNode = StyledTemplateNode & { type: 'variable'; key: string };
export type TemplateSignatureSlotNode = StyledTemplateNode & {
  type: 'signatureSlot';
  slotId: string;
  signer: 'PARTY_A';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
};
export type TemplatePageBreakNode = { type: 'pageBreak' };
export type TemplateNode =
  | TemplateHeadingNode
  | TemplateParagraphNode
  | TemplateTextNode
  | TemplateImageNode
  | TemplateTableNode
  | TemplateLoopTableNode
  | TemplateVariableNode
  | TemplateSignatureSlotNode
  | TemplatePageBreakNode;

export type TemplateAst = StyledTemplateNode & {
  type: 'page';
  children: TemplateNode[];
  header?: TemplateNode[];
  footer?: TemplateNode[];
};

export const SignatureSlotSchema = z.object({
  usage: z.string().min(1).optional(),
  slotId: z.string().min(1).optional(),
  signer: z.literal('PARTY_A').default('PARTY_A'),
  page: z.number().int().positive(),
  anchor: z.string().min(1).optional(),
  x: z.number().nonnegative().optional(),
  y: z.number().nonnegative().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  required: z.boolean(),
}).strict();

export const TemplateNodeSchema: z.ZodType<TemplateNode> = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), children: z.array(TemplateNodeSchema), styles: TemplateStyleSchema.optional() }).strict(),
  z.object({ type: z.literal('paragraph'), children: z.array(TemplateNodeSchema), styles: TemplateStyleSchema.optional() }).strict(),
  z.object({ type: z.literal('text'), text: z.string(), styles: TemplateStyleSchema.optional() }).strict(),
  z.object({ type: z.literal('image'), source: z.string().min(1), alt: z.string(), styles: TemplateStyleSchema.optional() }).strict(),
  z.object({
    type: z.literal('table'),
    rows: z.array(z.array(z.object({ children: z.array(TemplateNodeSchema), styles: TemplateStyleSchema.optional() }).strict()).min(1)).min(1),
    styles: TemplateStyleSchema.optional(),
  }).strict(),
  z.object({
    type: z.literal('loopTable'),
    source: z.literal('materials'),
    columns: z.array(z.object({ header: z.string().min(1), variable: z.string().min(1), styles: TemplateStyleSchema.optional() }).strict()).min(1),
    styles: TemplateStyleSchema.optional(),
  }).strict(),
  z.object({ type: z.literal('variable'), key: z.string().min(1), styles: TemplateStyleSchema.optional() }).strict(),
  z.object({
    type: z.literal('signatureSlot'),
    slotId: z.string().min(1),
    signer: z.literal('PARTY_A'),
    page: z.number().int().positive(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
    required: z.boolean(),
    styles: TemplateStyleSchema.optional(),
  }).strict(),
  z.object({ type: z.literal('pageBreak') }).strict(),
]));

export const TemplateAstSchema: z.ZodType<TemplateAst> = z.object({
  type: z.literal('page'),
  children: z.array(TemplateNodeSchema),
  header: z.array(TemplateNodeSchema).optional(),
  footer: z.array(TemplateNodeSchema).optional(),
  styles: TemplateStyleSchema.optional(),
}).strict();

export const TemplateVersionSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  version: z.number().int().positive(),
  status: CatalogVersionStatusSchema,
  ast: TemplateAstSchema,
  signatureMode: SignatureModeSchema,
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
  disabledAt: z.string().datetime().optional(),
}).strict().readonly();

export const TemplateCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  requirements: RequirementDefinitionSchema.array().optional(),
  ast: TemplateAstSchema.optional(),
  signatureMode: SignatureModeSchema.optional(),
}).strict();
export const TemplateUpdateSchema = TemplateCreateSchema.partial().extend({ name: z.string().min(1).optional() }).strict();

export type SignatureMode = z.infer<typeof SignatureModeSchema>;
export type TemplateVersion = z.infer<typeof TemplateVersionSchema>;
export type TemplateCreate = z.infer<typeof TemplateCreateSchema>;
export type TemplateUpdate = z.infer<typeof TemplateUpdateSchema>;

type AssertTemplateType<T extends true> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsExactTemplateType<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type _TemplateNodeIsPrecise = AssertTemplateType<IsExactTemplateType<IsAny<TemplateNode>, false>>;
type _AstChildrenArePrecise = AssertTemplateType<IsExactTemplateType<IsAny<TemplateAst['children'][number]>, false>>;
type _TextNodeHasStringText = AssertTemplateType<IsExactTemplateType<Extract<TemplateNode, { type: 'text' }>['text'], string>>;
type _UnknownNodeIsExcluded = AssertTemplateType<IsExactTemplateType<Extract<TemplateNode, { type: 'script' }>, never>>;
