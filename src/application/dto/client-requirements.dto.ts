/**
 * Client Requirements DTO
 * 顧客向け要件定義書の構造化データ型。
 * AI出力のJSON解析・バリデーションに使用する。
 */

import { z } from "zod";

// ── Zod スキーマ ──

const ProjectInfoSchema = z.object({
  projectName: z.string(),
  documentTitle: z.string(),
  subtitle: z.string().default(""),
  version: z.string().default("1.0"),
  author: z.string().default(""),
  createdDate: z.string().default(""),
  updatedDate: z.string().default(""),
  keyBenefits: z.array(z.string()).default([]),
});

const RequirementItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  description: z.string(),
  priority: z.enum(["Must", "Should", "Could"]),
  acceptanceCriteria: z.string().default(""),
});

const ParameterItemSchema = z.object({
  no: z.number(),
  dataId: z.string().default(""),
  itemName: z.string(),
  digits: z.string().default(""),
  type: z.string().default(""),
  remarks: z.string().default(""),
});

const FlowStepSchema = z.object({
  stepNumber: z.number(),
  actor: z.string(),
  action: z.string(),
  details: z.string().nullable().default(""),
  branchCondition: z.string().nullable().default(""),
  branchYes: z.union([z.string(), z.number()]).nullable().default(""),
  branchNo: z.union([z.string(), z.number()]).nullable().default(""),
}).transform((v) => ({
  ...v,
  details: v.details ?? "",
  branchCondition: v.branchCondition ?? "",
  branchYes: v.branchYes ?? "",
  branchNo: v.branchNo ?? "",
}));

const BusinessFlowSchema = z.object({
  flowName: z.string(),
  flowSummary: z.string().default(""),
  description: z.string().default(""),
  actors: z.array(z.string()),
  steps: z.array(FlowStepSchema),
});

const InitialDisplayItemSchema = z.object({
  item: z.string(),
  tableName: z.string(),
  columnName: z.string(),
  format: z.string(),
});

const InputCheckSchema = z.object({
  item: z.string(),
  checkContent: z.string(),
  errorMessage: z.string(),
});

const CrudRowSchema = z.object({
  tableName: z.string(),
  columnName: z.string(),
  method: z.string().optional(),
  condition: z.string().optional(),
  value: z.string().optional(),
  nullable: z.string().optional(),
  validation: z.string().optional(),
});

const CrudOperationSchema = z.object({
  operationType: z.enum(["select", "insert", "update", "delete"]),
  description: z.string(),
  rows: z.array(CrudRowSchema),
});

const AdditionalSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
});

const ScreenItemSchema = z.object({
  screenId: z.string(),
  screenName: z.string(),
  icon: z.string().default("📋"),
  description: z.string().default(""),
  mainItems: z.array(z.string()).default([]),
  relatedFlows: z.array(z.string()).default([]),
  transitions: z.array(z.string()).default([]),
  // 画面固有の入力/出力パラメータ
  inputParameters: z.array(ParameterItemSchema).optional(),
  outputParameters: z.array(ParameterItemSchema).optional(),
  // 処理概要
  screenOverview: z.string().optional(),
  screenFlow: z.string().optional(),
  // 初期表示内容
  initialDisplayItems: z.array(InitialDisplayItemSchema).optional(),
  // 入力チェック
  inputChecks: z.array(InputCheckSchema).optional(),
  // CRUD操作（DBテーブル単位）
  crudOperations: z.array(CrudOperationSchema).optional(),
  // AI判断の追加セクション
  additionalSections: z.array(AdditionalSectionSchema).optional(),
});

const TerminologyItemSchema = z.object({
  term: z.string(),
  definition: z.string(),
  relatedDomain: z.string().default(""),
});

const RelatedSettingSchema = z.object({
  settingItem: z.string(),
  settingLocation: z.string().default(""),
  remarks: z.string().default(""),
});

export const ClientRequirementsSchema = z.object({
  projectInfo: ProjectInfoSchema,
  processOverview: z.string().default(""),
  requirements: z.array(RequirementItemSchema),
  inputParameters: z.array(ParameterItemSchema).default([]),
  outputParameters: z.array(ParameterItemSchema).default([]),
  businessFlows: z.array(BusinessFlowSchema),
  screens: z.array(ScreenItemSchema).default([]),
  terminology: z.array(TerminologyItemSchema).default([]),
  relatedSettings: z.array(RelatedSettingSchema).default([]),
});

// ── 型エクスポート ──

export type ClientRequirementsDto = z.infer<typeof ClientRequirementsSchema>;
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;
export type RequirementItem = z.infer<typeof RequirementItemSchema>;
export type ParameterItem = z.infer<typeof ParameterItemSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type BusinessFlow = z.infer<typeof BusinessFlowSchema>;
export type ScreenItem = z.infer<typeof ScreenItemSchema>;
export type TerminologyItem = z.infer<typeof TerminologyItemSchema>;
export type RelatedSetting = z.infer<typeof RelatedSettingSchema>;

/**
 * AIの出力テキストからJSONを抽出してパースする。
 * ```json ... ``` ブロックまたは生JSONに対応。
 */
export function parseClientRequirements(rawOutput: string): ClientRequirementsDto {
  let jsonStr = rawOutput;

  // コードブロックからJSON部分を抽出
  const codeBlockMatch = rawOutput.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    // 生JSONを検出: 最初の { から最後の } まで
    const firstBrace = rawOutput.indexOf("{");
    const lastBrace = rawOutput.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = rawOutput.slice(firstBrace, lastBrace + 1);
    }
  }

  const parsed = JSON.parse(jsonStr);
  const result = ClientRequirementsSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`要件定義JSONのバリデーションに失敗しました: ${issues}`);
  }

  return result.data;
}
