/**
 * Google OAuth Helper
 * Google API の OAuth 認証を一元管理する共有ヘルパー。
 * Sheets / Slides / Drive 等の各アダプターから共通利用する。
 */

/** 全 Google API スコープ（スプレッドシート・スライド・ドライブ） */
const ALL_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/drive",
];

/** トークンファイル名（全スコープ共通） */
const TOKEN_FILE = "atelier-google-token.json";

/**
 * Google API 用の認証クライアントを取得する。
 *
 * 認証方法（優先順位順）:
 * 1. GOOGLE_OAUTH_CLIENT_CREDENTIALS 環境変数: OAuthクライアントJSON + トークンによる認証
 * 2. GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_APPLICATION_CREDENTIALS: サービスアカウント認証
 *
 * @param scopes 追加で要求するスコープ（デフォルトは全スコープ）
 */
export async function getGoogleAuthClient(
  scopes: string[] = ALL_SCOPES,
): Promise<import("googleapis").Auth.OAuth2Client | import("googleapis").Auth.GoogleAuth> {
  const { google } = await import("googleapis");

  // 1. OAuth クライアント認証（ブラウザログイン方式）
  const oauthClientPath = process.env.GOOGLE_OAUTH_CLIENT_CREDENTIALS;
  if (oauthClientPath) {
    return getOAuthClient(google, oauthClientPath, scopes);
  }

  // 2. サービスアカウント認証
  const keyPath =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!keyPath) {
    throw new Error(
      "Google API の認証情報が設定されていません。\n" +
      "以下のいずれかの環境変数を設定してください:\n" +
      "  GOOGLE_OAUTH_CLIENT_CREDENTIALS=<OAuthクライアントJSONファイルのパス>\n" +
      "  GOOGLE_SERVICE_ACCOUNT_KEY=<サービスアカウントJSONキーファイルのパス>\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS=<認証情報ファイルのパス>",
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes,
  });
}

/**
 * OAuthクライアント認証を行う。
 * 初回はブラウザでGoogleログインが必要。トークンは自動保存され、次回以降は自動認証。
 */
async function getOAuthClient(
  google: typeof import("googleapis").google,
  clientPath: string,
  scopes: string[],
): Promise<InstanceType<typeof google.auth.OAuth2>> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const http = await import("node:http");

  const content = fs.readFileSync(clientPath, "utf-8");
  const credentials = JSON.parse(content);
  const { client_id, client_secret } = credentials.installed || credentials.web;

  // ローカルサーバーで認証コードを受け取る
  const redirectUri = "http://localhost:3456";

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri,
  );

  // トークンファイルのパス（OAuthクライアントJSONと同じディレクトリ）
  const tokenPath = path.join(path.dirname(clientPath), TOKEN_FILE);

  // 既存トークンがあれば読み込む
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
    oAuth2Client.setCredentials(token);

    // スコープが不足している場合は再認証を促す
    const existingScopes = (token.scope ?? "").split(" ");
    const missingScopes = scopes.filter((s) => !existingScopes.includes(s));
    if (missingScopes.length > 0) {
      console.log("\n新しいスコープが必要です。再認証を行います...");
      fs.unlinkSync(tokenPath);
    } else {
      return oAuth2Client;
    }
  }

  // 初回: ローカルサーバーを立てて認証コードを自動受信
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:3456`);
      const authCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>認証に失敗しました</h1><p>ブラウザを閉じてください。</p>");
        server.close();
        reject(new Error(`Google認証エラー: ${error}`));
        return;
      }

      if (authCode) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>認証成功！</h1><p>このページを閉じてターミナルに戻ってください。</p>");
        server.close();
        resolve(authCode);
      }
    });

    server.listen(3456, () => {
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
      });

      console.log("\n━━━ Google認証が必要です ━━━");
      console.log("以下のURLをブラウザで開いてGoogleアカウントでログインしてください:\n");
      console.log(authUrl + "\n");

      // ブラウザを自動で開く（プラットフォーム対応）
      import("node:child_process").then(({ exec }) => {
        const cmd = process.platform === "win32"
          ? `start "" "${authUrl}"`
          : process.platform === "darwin"
            ? `open "${authUrl}"`
            : `xdg-open "${authUrl}" 2>/dev/null || wslview "${authUrl}" 2>/dev/null`;
        exec(cmd);
      });
    });

    // 2分でタイムアウト
    setTimeout(() => {
      server.close();
      reject(new Error("Google認証がタイムアウトしました（2分以内に認証してください）"));
    }, 120_000);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  // トークンを保存（次回以降は自動認証）
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log("認証トークンを保存しました。次回以降は自動認証されます。\n");

  return oAuth2Client;
}
