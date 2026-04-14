/**
 * DB Schema Extractor
 *
 * データベースに接続してスキーマ情報（テーブル・カラム）を抽出するモジュール。
 * 現在はMySQLのみ対応。PostgreSQL/SQLiteは将来対応予定。
 */

// ============================================================
// 型定義
// ============================================================

export interface DbConnectionConfig {
  type: "mysql" | "postgres" | "sqlite";
  host: string;
  port?: number;
  name: string;
  user?: string;
  password?: string;
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
  columnKey: string; // PRI, MUL, UNI, etc.
  extra: string; // auto_increment etc.
}

export interface TableInfo {
  tableName: string;
  columns: ColumnInfo[];
}

export interface DbSchema {
  databaseName: string;
  databaseType: string;
  tables: TableInfo[];
  extractedAt: string; // ISO date
}

// ============================================================
// MySQL用の型（mysql2の型を使わずに自前定義）
// ============================================================

interface MysqlConnection {
  query(sql: string): Promise<[unknown[], unknown]>;
  end(): Promise<void>;
}

interface MysqlModule {
  createConnection(config: {
    host: string;
    port: number;
    database: string;
    user?: string;
    password?: string;
  }): Promise<MysqlConnection>;
}

// ============================================================
// MySQL DESCRIBE結果の行型
// ============================================================

interface MysqlDescribeRow {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

// ============================================================
// メインAPI
// ============================================================

export async function extractDbSchema(
  config: DbConnectionConfig,
): Promise<DbSchema> {
  switch (config.type) {
    case "mysql":
      return extractMysqlSchema(config);
    case "postgres":
      throw new Error(
        "PostgreSQLは現在未対応です。将来のバージョンで対応予定です。",
      );
    case "sqlite":
      throw new Error(
        "SQLiteは現在未対応です。将来のバージョンで対応予定です。",
      );
    default: {
      const _exhaustive: never = config.type;
      throw new Error(`未対応のデータベースタイプです: ${String(_exhaustive)}`);
    }
  }
}

// ============================================================
// MySQL実装
// ============================================================

async function loadMysql2(): Promise<MysqlModule> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = (await (Function('return import("mysql2/promise")')() as Promise<unknown>)) as MysqlModule;
    return mod;
  } catch {
    throw new Error(
      "mysql2パッケージが見つかりません。以下のコマンドでインストールしてください:\n  npm install mysql2\n  または\n  pnpm add mysql2",
    );
  }
}

async function extractMysqlSchema(
  config: DbConnectionConfig,
): Promise<DbSchema> {
  const mysql = await loadMysql2();

  let connection: MysqlConnection | null = null;

  try {
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port ?? 3306,
      database: config.name,
      user: config.user,
      password: config.password,
    });

    // テーブル一覧を取得
    const [tableRows] = await connection.query("SHOW TABLES");
    const tables: TableInfo[] = [];

    for (const row of tableRows as Record<string, string>[]) {
      // SHOW TABLESの結果は `Tables_in_<db名>` というカラム名
      const tableName = Object.values(row)[0];
      if (typeof tableName !== "string") continue;

      // 各テーブルのカラム情報を取得
      const [describeRows] = await connection.query(
        `DESCRIBE \`${tableName}\``,
      );
      const columns: ColumnInfo[] = (
        describeRows as MysqlDescribeRow[]
      ).map((col) => ({
        columnName: col.Field,
        dataType: col.Type,
        isNullable: col.Null === "YES",
        columnDefault: col.Default,
        columnKey: col.Key,
        extra: col.Extra,
      }));

      tables.push({ tableName, columns });
    }

    return {
      databaseName: config.name,
      databaseType: "mysql",
      tables,
      extractedAt: new Date().toISOString(),
    };
  } catch (error) {
    // セキュリティ: パスワードやユーザー名を漏洩させない
    if (
      error instanceof Error &&
      (error.message.startsWith("mysql2パッケージが見つかりません") ||
        error.message.includes("は現在未対応です"))
    ) {
      throw error;
    }
    throw new Error(
      `DB接続に失敗しました（host: ${config.host}, port: ${String(config.port ?? 3306)}, database: ${config.name}）`,
    );
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {
        // 接続クローズのエラーは無視
      }
    }
  }
}
