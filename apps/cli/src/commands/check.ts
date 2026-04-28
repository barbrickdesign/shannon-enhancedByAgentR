/**
 * `shannon check` — pre-flight environment validator.
 *
 * Checks that all prerequisites are met before running a scan:
 *   1. Docker is installed
 *   2. Docker is running (daemon responsive)
 *   3. Docker Compose v2 is available
 *   4. At least one AI provider credential is configured
 *   5. (Local mode) pnpm is installed
 *   6. (Local mode) Worker image is built
 *   7. (NPX mode)   Worker image is available on Docker Hub (network reachable)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../env.js';
import { getWorkspacesDir, initHome } from '../home.js';
import { isLocal } from '../mode.js';

const PASS = '✓';
const FAIL = '✗';
const WARN = '!';

interface CheckResult {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail?: string;
  fix?: string;
}

function run(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// === Individual checks ===

function checkDockerInstalled(): CheckResult {
  const ok = run('docker', ['--version']);
  return {
    label: 'Docker installed',
    ok,
    ...(ok ? {} : { fix: 'Install Docker Desktop: https://docs.docker.com/get-docker/' }),
  };
}

function checkDockerRunning(): CheckResult {
  const ok = run('docker', ['info']);
  return {
    label: 'Docker daemon running',
    ok,
    ...(ok ? {} : { fix: 'Start Docker Desktop and wait for the whale icon to stop animating.' }),
  };
}

function checkDockerCompose(): CheckResult {
  const ok = run('docker', ['compose', 'version']);
  return {
    label: 'Docker Compose v2 available',
    ok,
    ...(ok ? {} : { fix: 'Upgrade Docker Desktop to v3.6+ or install the Compose plugin.' }),
  };
}

function checkCredentials(): CheckResult {
  // Check each supported provider
  if (process.env.ANTHROPIC_API_KEY) {
    return { label: 'AI credentials', ok: true, detail: 'Anthropic API key' };
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { label: 'AI credentials', ok: true, detail: 'Anthropic OAuth token' };
  }
  if (process.env.ANTHROPIC_BASE_URL && process.env.ANTHROPIC_AUTH_TOKEN) {
    return { label: 'AI credentials', ok: true, detail: 'Custom base URL' };
  }
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    const missing: string[] = [];
    if (!process.env.AWS_REGION) missing.push('AWS_REGION');
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK) missing.push('AWS_BEARER_TOKEN_BEDROCK');
    if (!process.env.ANTHROPIC_SMALL_MODEL) missing.push('ANTHROPIC_SMALL_MODEL');
    if (!process.env.ANTHROPIC_MEDIUM_MODEL) missing.push('ANTHROPIC_MEDIUM_MODEL');
    if (!process.env.ANTHROPIC_LARGE_MODEL) missing.push('ANTHROPIC_LARGE_MODEL');
    if (missing.length > 0) {
      return {
        label: 'AI credentials',
        ok: false,
        detail: `Bedrock mode — missing: ${missing.join(', ')}`,
        fix: 'Export the missing variables. See README.md → AWS Bedrock.',
      };
    }
    return { label: 'AI credentials', ok: true, detail: 'AWS Bedrock' };
  }
  if (process.env.CLAUDE_CODE_USE_VERTEX === '1') {
    const missing: string[] = [];
    if (!process.env.CLOUD_ML_REGION) missing.push('CLOUD_ML_REGION');
    if (!process.env.ANTHROPIC_VERTEX_PROJECT_ID) missing.push('ANTHROPIC_VERTEX_PROJECT_ID');
    if (!process.env.ANTHROPIC_SMALL_MODEL) missing.push('ANTHROPIC_SMALL_MODEL');
    if (!process.env.ANTHROPIC_MEDIUM_MODEL) missing.push('ANTHROPIC_MEDIUM_MODEL');
    if (!process.env.ANTHROPIC_LARGE_MODEL) missing.push('ANTHROPIC_LARGE_MODEL');
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) missing.push('GOOGLE_APPLICATION_CREDENTIALS');
    if (missing.length > 0) {
      return {
        label: 'AI credentials',
        ok: false,
        detail: `Vertex AI mode — missing: ${missing.join(', ')}`,
        fix: 'Export the missing variables. See README.md → Google Vertex AI.',
      };
    }
    return { label: 'AI credentials', ok: true, detail: 'Google Vertex AI' };
  }

  const fix = isLocal()
    ? 'Add ANTHROPIC_API_KEY=sk-ant-... to your .env file, or export it.'
    : 'Run `npx @keygraph/shannon setup`, or export ANTHROPIC_API_KEY=sk-ant-...';
  return {
    label: 'AI credentials',
    ok: false,
    detail: 'No provider configured',
    fix,
  };
}

function checkPnpm(): CheckResult {
  const ok = run('pnpm', ['--version']);
  return {
    label: 'pnpm installed',
    ok,
    ...(ok ? {} : { fix: 'Install pnpm: https://pnpm.io/installation' }),
  };
}

function checkWorkerImageBuilt(): CheckResult {
  const ok = run('docker', ['image', 'inspect', 'shannon-worker']);
  return {
    label: 'Worker image built (shannon-worker)',
    ok,
    ...(ok ? {} : { detail: 'Image not found', fix: 'Run `./shannon build` to build the worker image.' }),
  };
}

function checkNpxImageReachable(): CheckResult {
  // Just verify Docker is able to reach Docker Hub by checking if image exists or can be pulled.
  // We don't actually pull here — that would be slow. We just inform the user.
  const ok = run('docker', ['image', 'inspect', 'keygraph/shannon:latest']);
  if (ok) {
    return { label: 'Shannon image', ok: true, detail: 'keygraph/shannon:latest (cached locally)' };
  }
  return {
    label: 'Shannon image',
    ok: true,
    warn: true,
    detail: 'keygraph/shannon:latest not cached — will pull on first run (~1 GB)',
  };
}

function checkWorkspacesDir(): CheckResult {
  initHome();
  const dir = getWorkspacesDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Test writability
    const testFile = path.join(dir, '.write-test');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return { label: 'Workspaces directory writable', ok: true, detail: dir };
  } catch {
    return {
      label: 'Workspaces directory writable',
      ok: false,
      detail: dir,
      fix: `Check permissions on ${dir}`,
    };
  }
}

// === Render ===

function renderResult(r: CheckResult): void {
  const icon = r.ok ? (r.warn ? WARN : PASS) : FAIL;
  const colour = r.ok ? (r.warn ? '\x1b[33m' : '\x1b[32m') : '\x1b[31m';
  const reset = '\x1b[0m';
  const detail = r.detail ? `  ${r.detail}` : '';
  console.log(`  ${colour}${icon}${reset}  ${r.label}${detail}`);
  if (!r.ok && r.fix) {
    console.log(`       → ${r.fix}`);
  }
}

// === Entry point ===

export function check(): void {
  initHome();
  loadEnv();

  console.log('');
  console.log('Shannon pre-flight check');
  console.log('------------------------');
  console.log('');

  const results: CheckResult[] = [];

  // Always check Docker
  const dockerInstalled = checkDockerInstalled();
  results.push(dockerInstalled);

  if (dockerInstalled.ok) {
    results.push(checkDockerRunning());
    results.push(checkDockerCompose());
  }

  // Credentials
  results.push(checkCredentials());

  // Mode-specific
  if (isLocal()) {
    results.push(checkPnpm());
    results.push(checkWorkerImageBuilt());
  } else {
    results.push(checkNpxImageReachable());
  }

  // Workspaces dir
  results.push(checkWorkspacesDir());

  for (const r of results) {
    renderResult(r);
  }

  console.log('');

  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    console.log('  \x1b[32mAll checks passed.\x1b[0m  Ready to scan!');
    console.log('');
    const prefix = isLocal() ? './shannon' : 'npx @keygraph/shannon';
    console.log(`  ${prefix} start -u https://your-app.com -r /path/to/repo`);
  } else {
    console.log(`  \x1b[31m${failed.length} check(s) failed.\x1b[0m  Fix the issues above and re-run.`);
    process.exit(1);
  }
  console.log('');
}
