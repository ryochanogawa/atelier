/**
 * CheckMedium Use Case
 * 全 Medium の可用性チェック。
 */

import { isCommandAvailable } from "../../infrastructure/process/subprocess.js";

export interface MediumCheckResult {
  readonly name: string;
  readonly command: string;
  readonly available: boolean;
  readonly error?: string;
}

export interface MediumDefinition {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
}

export class MediumCheckUseCase {
  async execute(
    media: readonly MediumDefinition[],
  ): Promise<readonly MediumCheckResult[]> {
    const results: MediumCheckResult[] = [];

    for (const medium of media) {
      try {
        const available = await isCommandAvailable(medium.command);
        results.push({
          name: medium.name,
          command: medium.command,
          available,
          error: available
            ? undefined
            : `コマンド '${medium.command}' がPATH上に見つかりません`,
        });
      } catch (error) {
        results.push({
          name: medium.name,
          command: medium.command,
          available: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}
