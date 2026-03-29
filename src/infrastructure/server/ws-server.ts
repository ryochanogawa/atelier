import { WebSocketServer, WebSocket } from "ws";

// JSON-RPC 2.0 types
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type RpcHandler = (params: Record<string, unknown>) => Promise<unknown>;

export class AtelierWsServer {
  private wss: WebSocketServer | null = null;
  private handlers = new Map<string, RpcHandler>();
  private clients = new Set<WebSocket>();

  constructor(private port: number) {}

  registerHandler(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  broadcast(notification: JsonRpcNotification): void {
    const msg = JSON.stringify(notification);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on("listening", () => {
        console.log(`ATELIER Server listening on ws://localhost:${this.port}`);
        resolve();
      });

      this.wss.on("error", reject);

      this.wss.on("connection", (ws) => {
        this.clients.add(ws);
        console.log(`Client connected (total: ${this.clients.size})`);

        ws.on("message", async (data) => {
          try {
            const request = JSON.parse(data.toString()) as JsonRpcRequest;
            const response = await this.handleRequest(request);
            ws.send(JSON.stringify(response));
          } catch (err) {
            const errorResponse: JsonRpcResponse = {
              jsonrpc: "2.0",
              id: 0,
              error: { code: -32700, message: "Parse error" },
            };
            ws.send(JSON.stringify(errorResponse));
          }
        });

        ws.on("close", () => {
          this.clients.delete(ws);
          console.log(`Client disconnected (total: ${this.clients.size})`);
        });

        ws.on("error", (err) => {
          console.error("WebSocket client error:", err.message);
          this.clients.delete(ws);
        });
      });
    });
  }

  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
    }

    try {
      const result = await handler(request.params ?? {});
      return { jsonrpc: "2.0", id: request.id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : "Internal error",
        },
      };
    }
  }

  async stop(): Promise<void> {
    if (!this.wss) return;
    for (const client of this.clients) {
      client.close();
    }
    return new Promise((resolve) => {
      this.wss!.close(() => resolve());
    });
  }
}
