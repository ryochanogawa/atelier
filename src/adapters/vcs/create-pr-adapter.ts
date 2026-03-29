/**
 * PR Adapter Factory
 * VCS プロバイダーを自動検出し、適切な PullRequestPort 実装を返す。
 */

import { detectVcsProvider } from "./vcs-detector.js";
import { GitHubPRAdapter } from "./github-pr.adapter.js";
import { GitLabMRAdapter } from "./gitlab-mr.adapter.js";
import type { PullRequestPort } from "../../domain/ports/pull-request.port.js";

export async function createPRAdapter(cwd: string): Promise<PullRequestPort> {
  const provider = await detectVcsProvider(cwd);
  switch (provider) {
    case "gitlab":
      return new GitLabMRAdapter();
    case "github":
    default:
      return new GitHubPRAdapter();
  }
}
