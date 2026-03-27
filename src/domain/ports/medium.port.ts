/**
 * Medium Port
 * AIプロバイダーとの通信ポート（インターフェースのみ）。
 */

import type {
  MediumRequest,
  MediumResponse,
} from "../value-objects/medium-config.vo.js";

export interface MediumPort {
  readonly name: string;

  /** プロバイダーの利用可能性を確認する */
  checkAvailability(): Promise<boolean>;

  /** プロンプトを実行しレスポンスを取得する */
  execute(request: MediumRequest): Promise<MediumResponse>;

  /** 実行中のリクエストを中断する */
  abort(): Promise<void>;
}
