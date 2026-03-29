/**
 * Slack 通知アダプター
 * Incoming Webhook を使用して Slack に通知を送信する。
 */

export interface SlackMessage {
  readonly text: string;
  readonly blocks?: readonly SlackBlock[];
}

export interface SlackBlock {
  readonly type: string;
  readonly text?: {
    readonly type: string;
    readonly text: string;
  };
  readonly fields?: readonly {
    readonly type: string;
    readonly text: string;
  }[];
}

/**
 * Slack Webhook URL に通知を送信する。
 * 環境変数 ATELIER_SLACK_WEBHOOK_URL で設定可能。
 */
export async function sendSlackNotification(
  webhookUrl: string,
  message: SlackMessage,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(
      `Slack notification failed: ${response.status} ${response.statusText}`,
    );
  }
}

/**
 * Commission 完了時の Slack 通知メッセージを生成する。
 */
export function buildCommissionCompleteMessage(params: {
  commissionName: string;
  runId: string;
  status: string;
  duration: string;
  prUrl?: string;
}): SlackMessage {
  const statusEmoji = params.status === "completed" ? ":white_check_mark:" : ":warning:";

  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Commission:*\n${params.commissionName}` },
    { type: "mrkdwn", text: `*Status:*\n${statusEmoji} ${params.status}` },
    { type: "mrkdwn", text: `*Duration:*\n${params.duration}` },
    { type: "mrkdwn", text: `*Run ID:*\n\`${params.runId}\`` },
  ];

  if (params.prUrl) {
    fields.push({ type: "mrkdwn", text: `*PR:*\n<${params.prUrl}|View PR>` });
  }

  return {
    text: `ATELIER: ${params.commissionName} ${params.status}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `ATELIER: ${params.commissionName}`,
        },
      },
      {
        type: "section",
        fields,
      },
    ],
  };
}

/**
 * Commission 失敗時の Slack 通知メッセージを生成する。
 */
export function buildCommissionFailedMessage(params: {
  commissionName: string;
  runId: string;
  error: string;
}): SlackMessage {
  return {
    text: `ATELIER: ${params.commissionName} failed`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:x: ATELIER: ${params.commissionName} failed`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Run ID:* \`${params.runId}\`\n*Error:* ${params.error}`,
        },
      },
    ],
  };
}

/**
 * 環境変数から Slack Webhook URL を取得する。
 * 未設定の場合は undefined を返す。
 */
export function getSlackWebhookUrl(): string | undefined {
  return process.env.ATELIER_SLACK_WEBHOOK_URL;
}
