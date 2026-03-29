import { AtelierWsServer } from "../ws-server.js";

export function registerWorkspaceHandlers(server: AtelierWsServer, workspaces: string[]): void {
  server.registerHandler("workspace.list", async () => {
    return { workspaces };
  });

  server.registerHandler("workspace.info", async (params) => {
    const workspacePath = params.path as string;
    return {
      path: workspacePath,
      name: workspacePath.split("/").pop(),
    };
  });
}
