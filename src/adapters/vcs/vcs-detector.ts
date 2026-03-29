/**
 * VCS Provider Detector
 * Git remote URL からホスティングプロバイダーを自動検出する。
 */

import { execa } from "execa";

export type VcsProvider = "github" | "gitlab" | "unknown";

export async function detectVcsProvider(cwd: string): Promise<VcsProvider> {
  try {
    const result = await execa("git", ["remote", "get-url", "origin"], { cwd, reject: false });
    const url = result.stdout.trim();

    if (url.includes("github.com") || url.includes("github")) return "github";
    if (url.includes("gitlab.com") || url.includes("gitlab")) return "gitlab";

    return "unknown";
  } catch {
    return "unknown";
  }
}
