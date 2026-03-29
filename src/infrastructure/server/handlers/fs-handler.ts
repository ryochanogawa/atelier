import { promises as fs } from "node:fs";
import * as path from "node:path";
import { AtelierWsServer } from "../ws-server.js";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

// Directories/files to skip
const IGNORED = new Set([
  "node_modules", ".git", ".next", "dist", ".turbo",
  ".DS_Store", "thumbs.db", ".atelier",
]);

export function registerFsHandlers(server: AtelierWsServer, allowedRoots: string[]): void {
  // Validate that a path is within allowed roots
  function validatePath(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    const isAllowed = allowedRoots.some((root) => resolved.startsWith(path.resolve(root)));
    if (!isAllowed) {
      throw new Error(`Access denied: ${resolved} is outside allowed roots`);
    }
    return resolved;
  }

  server.registerHandler("fs.readDir", async (params) => {
    const dirPath = validatePath(params.path as string);
    const depth = (params.depth as number) ?? 1;
    return readDirRecursive(dirPath, depth);
  });

  server.registerHandler("fs.readFile", async (params) => {
    const filePath = validatePath(params.path as string);
    const content = await fs.readFile(filePath, "utf-8");
    return { content, path: filePath };
  });

  server.registerHandler("fs.writeFile", async (params) => {
    const filePath = validatePath(params.path as string);
    const content = params.content as string;
    await fs.writeFile(filePath, content, "utf-8");
    return { success: true, path: filePath };
  });

  server.registerHandler("fs.stat", async (params) => {
    const filePath = validatePath(params.path as string);
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      modified: stat.mtime.toISOString(),
    };
  });
}

async function readDirRecursive(dirPath: string, depth: number): Promise<FileNode[]> {
  if (depth <= 0) return [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  // Sort: directories first, then alphabetically
  const sorted = entries
    .filter((e) => !IGNORED.has(e.name) && !e.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (const entry of sorted) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = depth > 1 ? await readDirRecursive(fullPath, depth - 1) : undefined;
      nodes.push({ name: entry.name, path: fullPath, type: "directory", children });
    } else {
      nodes.push({ name: entry.name, path: fullPath, type: "file" });
    }
  }

  return nodes;
}
