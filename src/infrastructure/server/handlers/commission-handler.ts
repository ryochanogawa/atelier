/**
 * Commission JSON-RPC Handler
 * commission.run メソッドを処理し、CommissionRunUseCase を呼び出す。
 */

import type { AtelierWsServer } from "../ws-server.js";
import type { CommissionRunUseCase } from "../../../application/use-cases/run-commission.use-case.js";
import type { RunOptions } from "../../../shared/types.js";

export function registerCommissionHandlers(
  server: AtelierWsServer,
  commissionUseCase: CommissionRunUseCase,
  projectPath: string,
): void {
  server.registerHandler("commission.run", async (params) => {
    const name = params.name as string;
    if (!name) {
      throw new Error("params.name is required");
    }

    const task = params.task as string | undefined;
    const medium = params.medium as string | undefined;

    const options: RunOptions = {
      dryRun: false,
      medium,
      initialCanvas: task ? { task } : undefined,
    };

    const result = await commissionUseCase.execute(name, projectPath, options);
    return result;
  });
}
