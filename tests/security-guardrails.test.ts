import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src");
const thisFile = path.relative(repoRoot, __filename).replace(/\\/g, "/");

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8"
  })
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, "/"));
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      files.push(...walkFiles(absolute));
    } else if (stats.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function readRelativeFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sourceFiles(): string[] {
  return walkFiles(srcRoot)
    .map((file) => path.relative(repoRoot, file).replace(/\\/g, "/"))
    .filter((file) => file !== thisFile);
}

function filesContaining(files: string[], pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(readRelativeFile(file)));
}

describe("security guardrails", () => {
  it("does not hardcode the production n8n host in application source", () => {
    const forbiddenHost = ["barberagency-n8n", "gymh5g", "easypanel.host"].join(".");
    const files = [
      ...sourceFiles(),
      "Dockerfile",
      "package.json",
      ".github/workflows/ci.yml"
    ].filter((file) => existsSync(path.join(repoRoot, file)));

    expect(filesContaining(files, new RegExp(forbiddenHost.replaceAll(".", "\\.")))).toEqual([]);
  });

  it("does not expose private operational endpoints through NEXT_PUBLIC variables", () => {
    const dangerousPublicEnv = [
      "NEXT_PUBLIC_DASHBOARD_STATE_ENDPOINT",
      "NEXT_PUBLIC_DASHBOARD_LOGIN_ENDPOINT",
      "NEXT_PUBLIC_DRAFT_SAVE_ENDPOINT",
      "NEXT_PUBLIC_PUBLISH_ENDPOINT",
      "NEXT_PUBLIC_POS_SALE_ENDPOINT",
      "NEXT_PUBLIC_DASHBOARD_RECOVER_REQUEST_ENDPOINT",
      "NEXT_PUBLIC_DASHBOARD_RECOVER_RESET_ENDPOINT"
    ];
    const pattern = new RegExp(dangerousPublicEnv.join("|"));
    const files = [
      ...sourceFiles(),
      "Dockerfile",
      "package.json",
      ".github/workflows/ci.yml"
    ].filter((file) => existsSync(path.join(repoRoot, file)));

    expect(filesContaining(files, pattern)).toEqual([]);
  });

  it("keeps client code behind same-origin API routes instead of direct webhooks", () => {
    const clientFiles = sourceFiles().filter((file) => {
      if (file === "src/lib/dashboard-api.ts") return true;
      const content = readRelativeFile(file);
      return content.startsWith("\"use client\"") || content.startsWith("'use client'");
    });

    expect(filesContaining(clientFiles, /\/webhook\/|barberagency-n8n/i)).toEqual([]);
  });

  it("does not use dynamic code execution in application source", () => {
    const dynamicCodePatterns = [/\beval\s*\(/, /\bnew\s+Function\b/, /\bFunction\s*\(/];
    const offenders = sourceFiles().filter((file) => {
      const content = readRelativeFile(file);
      return dynamicCodePatterns.some((pattern) => pattern.test(content));
    });

    expect(offenders).toEqual([]);
  });

  it("does not track build artifacts, logs, or local secrets", () => {
    const sensitiveTracked = trackedFiles().filter((file) => {
      if (file.endsWith(".env.local.example")) return false;
      return /(^|\/)(\.env|\.env\.local|\.next|tsconfig\.tsbuildinfo|.*\.log)$/.test(file);
    });

    expect(sensitiveTracked).toEqual([]);
  });

  it("keeps critical same-origin route handlers present", () => {
    const criticalRoutes = [
      "src/app/api/dashboard/state/route.ts",
      "src/app/api/configuracion/update/route.ts",
      "src/app/api/editor/publish/route.ts",
      "src/app/api/editor/draft/route.ts",
      "src/app/api/pos/route.ts",
      "src/app/api/auth/login/route.ts",
      "src/app/api/auth/recover/request/route.ts",
      "src/app/api/auth/recover/reset/route.ts",
      "src/app/api/session/login/route.ts",
      "src/app/api/session/me/route.ts"
    ];

    expect(criticalRoutes.filter((file) => !existsSync(path.join(repoRoot, file)))).toEqual([]);
  });

  it("keeps recovery endpoints server-only", () => {
    const requestRoute = readRelativeFile("src/app/api/auth/recover/request/route.ts");
    const resetRoute = readRelativeFile("src/app/api/auth/recover/reset/route.ts");

    expect(requestRoute).toContain("process.env.DASHBOARD_RECOVER_REQUEST_ENDPOINT");
    expect(resetRoute).toContain("process.env.DASHBOARD_RECOVER_RESET_ENDPOINT");
    expect(requestRoute).not.toContain("NEXT_PUBLIC");
    expect(resetRoute).not.toContain("NEXT_PUBLIC");
  });
});
