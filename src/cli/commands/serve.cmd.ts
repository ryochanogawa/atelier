import { Command } from "commander";
import { AtelierWsServer } from "../../infrastructure/server/ws-server.js";
import { registerFsHandlers } from "../../infrastructure/server/handlers/fs-handler.js";
import { registerWorkspaceHandlers } from "../../infrastructure/server/handlers/workspace-handler.js";

export function createServeCommand(): Command {
  const cmd = new Command("serve")
    .description("Start ATELIER WebSocket server for editor integration")
    .option("-p, --port <port>", "Server port", "4000")
    .option("-w, --workspace <paths...>", "Workspace root paths to serve")
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const workspaces: string[] = options.workspace ?? [process.cwd()];

      const server = new AtelierWsServer(port);

      // Register API handlers
      registerFsHandlers(server, workspaces);
      registerWorkspaceHandlers(server, workspaces);

      // Graceful shutdown
      const shutdown = async () => {
        console.log("\nShutting down...");
        await server.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      await server.start();
      console.log(`Serving workspaces: ${workspaces.join(", ")}`);
      console.log("Press Ctrl+C to stop");
    });

  return cmd;
}
