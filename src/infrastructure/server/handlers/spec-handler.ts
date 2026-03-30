/**
 * Spec JSON-RPC Handler
 * spec.list / spec.show メソッドを処理し、SpecManagementUseCase を呼び出す。
 */

import type { AtelierWsServer } from "../ws-server.js";
import { SpecManagementUseCase } from "../../../application/use-cases/spec-management.use-case.js";

export function registerSpecHandlers(
  server: AtelierWsServer,
  projectPath: string,
): void {
  const specUseCase = new SpecManagementUseCase(projectPath);

  server.registerHandler("spec.list", async () => {
    return specUseCase.list();
  });

  server.registerHandler("spec.show", async (params) => {
    const id = params.id as string;
    if (!id) {
      throw new Error("params.id is required");
    }
    return specUseCase.show(id);
  });
}
