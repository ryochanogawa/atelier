/**
 * Presentation Port
 * プレゼンテーションへの書き出しポート。
 */

import type { ClientRequirementsDto } from "../../application/dto/client-requirements.dto.js";

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
}
