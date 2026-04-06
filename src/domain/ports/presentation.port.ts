/**
 * Presentation Port
 * プレゼンテーションへの書き出しポート。
 */

import type { ClientRequirementsDto } from "../../application/dto/client-requirements.dto.js";
import type { SlidePlanDto } from "../../application/dto/slide-plan.dto.js";

/** プレゼンテーション書き出し結果 */
export interface PresentationWriteResult {
  readonly presentationId: string;
  readonly presentationUrl: string;
}

export interface PresentationPort {
  /**
   * プレゼンテーションを作成し、全スライドを書き出す。
   * @returns プレゼンテーションIDとURL
   */
  create(data: ClientRequirementsDto): Promise<PresentationWriteResult>;

  /**
   * スライドプランからプレゼンテーションを作成する。
   * AIが生成したスライド構成プランに基づいてスライドを描画する。
   */
  createFromPlan(plan: SlidePlanDto): Promise<PresentationWriteResult>;
}
