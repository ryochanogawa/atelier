/**
 * File System Utilities
 * ファイル・ディレクトリ操作のユーティリティ。
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * ディレクトリが存在しなければ再帰的に作成する。
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * ファイルが存在するか確認する。
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * ディレクトリが存在するか確認する。
 */
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * テキストファイルを読み込む。
 */
export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

/**
 * テキストファイルを書き込む。親ディレクトリが存在しなければ作成する。
 */
export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * ディレクトリ内のファイル一覧を取得する。
 */
export async function listFiles(
  dirPath: string,
  extension?: string,
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let files = entries
      .filter((e) => e.isFile())
      .map((e) => path.join(dirPath, e.name));

    if (extension) {
      files = files.filter((f) => f.endsWith(extension));
    }

    return files.sort();
  } catch {
    return [];
  }
}

/**
 * ディレクトリ内のサブディレクトリ一覧を取得する。
 */
export async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * ファイルまたはディレクトリを再帰的に削除する。
 */
export async function remove(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

/**
 * ファイルをコピーする。
 */
export async function copyFile(
  src: string,
  dest: string,
): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}
