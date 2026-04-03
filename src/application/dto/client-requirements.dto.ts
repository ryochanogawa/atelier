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
  version: z.string().default("1.0"),
  author: z.string().default(""),
  createdDate: z.string().default(""),
  updatedDate: z.string().default(""),
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
  details: z.string().default(""),
  branchCondition: z.string().default(""),
  branchYes: z.union([z.string(), z.number()]).default(""),
  branchNo: z.union([z.string(), z.number()]).default(""),
});

const BusinessFlowSchema = z.object({
  flowName: z.string(),
  description: z.string().default(""),
  actors: z.array(z.string()),
  steps: z.array(FlowStepSchema),
});

const ScreenItemSchema = z.object({
  screenId: z.string(),
  screenName: z.string(),
  description: z.string().default(""),
  mainItems: z.array(z.string()).default([]),
  relatedFlows: z.array(z.string()).default([]),
  transitions: z.array(z.string()).default([]),
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
