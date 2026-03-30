import { Command } from "commander";
import { AtelierWsServer } from "../../infrastructure/server/ws-server.js";
import { registerFsHandlers } from "../../infrastructure/server/handlers/fs-handler.js";
import { registerWorkspaceHandlers } from "../../infrastructure/server/handlers/workspace-handler.js";
import { registerSpecHandlers } from "../../infrastructure/server/handlers/spec-handler.js";

export function createServeCommand(): Command {
  const cmd = new Command("serve")
    .description("Start ATELIER WebSocket server for editor integration")
    .option("-p, --port <port>", "Server port", "3000")
    .option("-w, --workspace <paths...>", "Workspace root paths to serve")
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const workspaces: string[] = options.workspace ?? [process.cwd()];
      const startedAt = new Date().toISOString();

      const server = new AtelierWsServer(port);

      // Register API handlers
      registerFsHandlers(server, workspaces);
      registerWorkspaceHandlers(server, workspaces);

      // Register spec handlers (use first workspace as project path)
      registerSpecHandlers(server, workspaces[0]);

      // Status handler
      server.registerHandler("status", async () => {
        return {
          status: "running",
          port,
          workspaces,
          startedAt,
          uptime: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
          handlers: [
            "fs.readDir",
            "fs.readFile",
            "fs.writeFile",
            "fs.stat",
            "workspace.list",
            "workspace.info",
            "spec.list",
            "spec.show",
            "status",
          ],
        };
      });

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
