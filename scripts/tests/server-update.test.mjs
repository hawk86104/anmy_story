import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const scriptPath = new URL(
  "../../deploy/tencent/update-server.sh",
  import.meta.url,
);
const sourceScript = readFileSync(scriptPath, "utf8");
const tempBase =
  process.platform === "win32" && process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Temp")
    : os.tmpdir();
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

function findBash() {
  if (process.env.BASH_FOR_TEST) return process.env.BASH_FOR_TEST;
  if (process.platform !== "win32") return "bash";
  const gitCore = git(process.cwd(), "--exec-path");
  const candidate = path.resolve(gitCore, "../../..", "bin", "bash.exe");
  return existsSync(candidate) ? candidate : null;
}
const bash = findBash();

function writeExecutable(file, content) {
  writeFileSync(file, `#!/usr/bin/env bash\n${content}\n`, { mode: 0o755 });
  chmodSync(file, 0o755);
}

function fixture() {
  const root = mkdtempSync(path.join(tempBase, "mylife-deploy-test-"));
  const source = path.join(root, "source");
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  const backup = path.join(root, "backups");
  const mocks = path.join(root, "mocks");
  const trace = path.join(root, "commands.log");
  mkdirSync(path.join(source, "deploy", "tencent"), { recursive: true });
  mkdirSync(path.join(source, "apps", "cms"), { recursive: true });
  mkdirSync(mocks);
  writeFileSync(
    path.join(source, ".gitignore"),
    ".env\nnode_modules/\n*.db\nmedia/\nmedia-originals/\n",
  );
  writeFileSync(path.join(source, ".nvmrc"), `${process.version.slice(1)}\n`);
  writeFileSync(path.join(source, "README.md"), "old version\n");
  writeFileSync(
    path.join(source, "apps", "cms", "package.json"),
    '{"name":"test-cms"}\n',
  );
  const originalNextEnv =
    '/// <reference types="next" />\nimport "./.next/dev/types/routes.d.ts";\nimport "./.next/dev/types/root-params.d.ts";\n';
  writeFileSync(
    path.join(source, "apps", "cms", "next-env.d.ts"),
    originalNextEnv,
  );
  writeFileSync(
    path.join(source, "deploy", "tencent", "ecosystem.config.cjs"),
    "module.exports = {};\n",
  );
  writeFileSync(
    path.join(source, "deploy", "tencent", "update-server.sh"),
    sourceScript,
  );
  git(source, "init", "-b", "main");
  git(source, "config", "user.email", "test@example.invalid");
  git(source, "config", "user.name", "Test User");
  git(source, "config", "core.autocrlf", "false");
  git(source, "add", ".");
  git(source, "commit", "-m", "old release");
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  git(source, "remote", "add", "origin", remote);
  git(source, "push", "-u", "origin", "main");
  execFileSync(
    "git",
    ["-c", "core.autocrlf=false", "clone", "-b", "main", remote, work],
    { stdio: "ignore" },
  );
  git(work, "config", "user.email", "test@example.invalid");
  git(work, "config", "user.name", "Test User");
  git(work, "config", "core.autocrlf", "false");
  const oldSha = git(work, "rev-parse", "HEAD");
  writeFileSync(path.join(source, "README.md"), "new version\n");
  writeFileSync(
    path.join(source, "deploy", "tencent", "update-server.sh"),
    `${sourceScript}\n# Updated while the old script is running.\n`,
  );
  git(source, "add", ".");
  git(source, "commit", "-m", "new release");
  git(source, "push", "origin", "main");
  const targetSha = git(source, "rev-parse", "HEAD");

  const db = path.join(work, "test.db");
  const media = path.join(work, "media");
  const originals = path.join(work, "media-originals");
  const slash = (value) => value.replaceAll("\\", "/");
  mkdirSync(media);
  mkdirSync(originals);
  const database = new DatabaseSync(db);
  database.exec(
    "CREATE TABLE media (id INTEGER PRIMARY KEY, filename TEXT, storage TEXT, original_filename TEXT, processing_status TEXT); INSERT INTO media VALUES (1, 'photo.txt', 'local', 'original.txt', 'ready');",
  );
  database.close();
  writeFileSync(path.join(media, "photo.txt"), "test media\n");
  writeFileSync(path.join(originals, "original.txt"), "test original\n");
  writeFileSync(
    path.join(work, "apps", "cms", ".env"),
    [
      `DATABASE_URL=file:${slash(db)}`,
      `MEDIA_ROOT=${slash(media)}`,
      `ORIGINALS_ROOT=${slash(originals)}`,
      "MEDIA_STORAGE=cos",
      "PAYLOAD_SECRET=private-test-secret-never-in-output",
      "NODE_ENV=production",
    ].join("\n") + "\n",
  );
  const dotenv = path.join(work, "node_modules", "dotenv");
  mkdirSync(dotenv, { recursive: true });
  writeFileSync(
    path.join(dotenv, "index.js"),
    `exports.parse = (input) => Object.fromEntries(String(input).split(/\\r?\\n/).filter(Boolean).map((line) => { const at=line.indexOf('='); return [line.slice(0,at),line.slice(at+1)]; }));\n`,
  );

  writeExecutable(
    path.join(mocks, "pm2"),
    [
      'printf "pm2 %s\\n" "$*" >> "$MOCK_TRACE"',
      'case "$1" in',
      '  jlist)',
      '    printf "%s" "${MOCK_PM2_JLIST_PREFIX:-}"',
      '    if [[ -n "${MOCK_PM2_JLIST_OVERRIDE:-}" ]]; then printf "%s" "$MOCK_PM2_JLIST_OVERRIDE"; else printf \'[{"name":"anmy-cms","pm2_env":{"status":"online","pm_cwd":"%s"}},{"name":"anmy-media","pm2_env":{"status":"online","pm_cwd":"%s"}}]\' "$MOCK_CMS_DIR" "$MOCK_CMS_DIR"; fi',
      '    printf "%s" "${MOCK_PM2_JLIST_SUFFIX:-}"',
      '    if [[ "${MOCK_PM2_JLIST_FAIL:-0}" == 1 ]]; then exit 42; fi ;;',
      '  *) printf "mock pm2 %s\\n" "$*" ;;',
      "esac",
    ].join("\n"),
  );
  const sqliteMock = path.join(mocks, "sqlite-mock.cjs");
  writeFileSync(
    sqliteMock,
    String.raw`
const { DatabaseSync, backup } = require("node:sqlite");
const args = process.argv.slice(2);
if (args[0] === "-cmd") args.splice(0, 2);
const [file, command] = args;
const db = new DatabaseSync(file, { readOnly: true });
(async () => {
  if (command.startsWith(".backup ")) {
    const match = command.match(/^\.backup '([^']+)'$/);
    if (!match) throw new Error("bad backup command");
    let target = match[1];
    if (process.platform === "win32" && /^\/[a-z]\//i.test(target)) target = target[1] + ":" + target.slice(2);
    await backup(db, target);
  } else {
    const rows = db.prepare(command).all();
    for (const row of rows) console.log(Object.values(row).join("|"));
  }
  db.close();
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
`,
  );
  writeExecutable(
    path.join(mocks, "sqlite3"),
    'exec node "$MOCK_SQLITE_JS" "$@"',
  );
  writeExecutable(
    path.join(mocks, "npm"),
    [
      'printf "npm %s\\n" "$*" >> "$MOCK_TRACE"',
      'if [[ "$*" == *db:migrate* && "${MOCK_FAIL_MIGRATION:-0}" == 1 ]]; then echo "mock migration failure" >&2; exit 41; fi',
      'if [[ "$*" == *"build --workspace"* ]]; then if [[ -n "${MOCK_NEXT_DIST_DIR:-}" ]]; then sed -i "s|\\.next/dev/types/|${MOCK_NEXT_DIST_DIR}/types/|g" "$PROJECT_DIR/apps/cms/next-env.d.ts"; else sed -i "s|/dev/types/|/types/|g" "$PROJECT_DIR/apps/cms/next-env.d.ts"; fi; if [[ "${MOCK_UNEXPECTED_NEXT_ENV:-0}" == 1 ]]; then printf "// unexpected change\\n" >> "$PROJECT_DIR/apps/cms/next-env.d.ts"; fi; fi',
      'printf "mock npm %s\\n" "$*"',
    ].join("\n"),
  );
  writeExecutable(
    path.join(mocks, "curl"),
    'if [[ "${MOCK_FAIL_HEALTH:-0}" == 1 ]]; then exit 22; fi\nprintf \'{"ok":true}\'',
  );
  writeExecutable(path.join(mocks, "flock"), "exit 0");
  writeExecutable(path.join(mocks, "sleep"), "exit 0");
  writeExecutable(path.join(mocks, "ffmpeg"), "exit 0");
  writeExecutable(path.join(mocks, "ffprobe"), "exit 0");
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "MEDIA_ROOT",
    "ORIGINALS_ROOT",
    "MEDIA_STORAGE",
    "PAYLOAD_SECRET",
    "NODE_ENV",
    "ANMY_UPDATE_LOADED",
    "FFMPEG_PATH",
    "FFPROBE_PATH",
    "NODE_BIN_DIR",
  ])
    delete env[key];
  Object.assign(env, {
    PROJECT_DIR: work,
    BACKUP_ROOT: backup,
    MOCK_TRACE: trace,
    MOCK_DB: db,
    MOCK_SQLITE_JS: sqliteMock,
    MOCK_CMS_DIR: slash(realpathSync(path.join(work, "apps", "cms"))),
    MOCK_BIN: mocks,
  });
  return {
    root,
    source,
    work,
    backup,
    trace,
    env,
    oldSha,
    targetSha,
    originalNextEnv,
  };
}

function run(f, extra = {}) {
  const prepend =
    process.platform === "win32" ? '$(cygpath -u "$MOCK_BIN")' : "$MOCK_BIN";
  return spawnSync(
    bash,
    [
      "-c",
      `export PATH="${prepend}:$PATH"; exec bash "$PROJECT_DIR/deploy/tencent/update-server.sh"`,
    ],
    {
      cwd: f.work,
      env: { ...f.env, ...extra },
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
}

function cleanup(root) {
  const temp = realpathSync(tempBase);
  const resolved = realpathSync(root);
  if (
    !resolved.startsWith(`${temp}${path.sep}`) ||
    !path.basename(resolved).startsWith("mylife-deploy-test-")
  )
    throw new Error("Refusing to remove an unexpected test directory");
  rmSync(resolved, { recursive: true, force: true });
}

test(
  "服务器更新脚本：安全快进、备份、迁移、重启与失败处理",
  { skip: !bash, timeout: 240000 },
  async (t) => {
    await t.test(
      "完整流程使用新 main，保留备份，且自身更新不会中断执行",
      () => {
        const f = fixture();
        try {
          git(f.work, "switch", "--detach", f.oldSha);
          const result = run(f);
          assert.equal(result.status, 0, result.stderr + result.stdout);
          assert.equal(git(f.work, "branch", "--show-current"), "main");
          assert.equal(git(f.work, "rev-parse", "HEAD"), f.targetSha);
          assert.equal(
            git(f.work, "status", "--porcelain", "--untracked-files=no"),
            "",
          );
          assert.equal(
            readFileSync(
              path.join(f.work, "apps", "cms", "next-env.d.ts"),
              "utf8",
            ),
            f.originalNextEnv,
          );
          assert.match(
            readFileSync(
              path.join(f.work, "deploy", "tencent", "update-server.sh"),
              "utf8",
            ),
            /Updated while/,
          );
          const trace = readFileSync(f.trace, "utf8");
          for (const command of [
            "pm2 stop anmy-cms",
            "pm2 stop anmy-media",
            "npm ci --include=dev",
            "npm run db:migrate",
            "npm run build",
            "pm2 restart",
            "pm2 save",
          ])
            assert.ok(trace.includes(command), command);
          const dirs = readdirSync(f.backup).filter(
            (name) => name !== "logs" && name !== ".update.lock",
          );
          assert.equal(dirs.length, 1);
          assert.equal(
            readFileSync(
              path.join(f.backup, dirs[0], "code-commit.txt"),
              "utf8",
            ).trim(),
            f.oldSha,
          );
          const restoredDb = new DatabaseSync(
            path.join(f.backup, dirs[0], "db", "mylife.db"),
            { readOnly: true },
          );
          assert.equal(
            restoredDb.prepare("SELECT filename FROM media").get().filename,
            "photo.txt",
          );
          restoredDb.close();
          assert.equal(
            readFileSync(
              path.join(f.backup, dirs[0], "media", "photo.txt"),
              "utf8",
            ),
            "test media\n",
          );
          assert.equal(
            JSON.parse(
              readFileSync(
                path.join(f.backup, dirs[0], "pm2-processes.json"),
                "utf8",
              ),
            ).length,
            2,
          );
          assert.doesNotMatch(
            result.stdout + result.stderr,
            /private-test-secret-never-in-output/,
          );
          const repeated = run(f);
          assert.equal(repeated.status, 0, repeated.stderr + repeated.stdout);
          assert.equal(git(f.work, "rev-parse", "HEAD"), f.targetSha);
          assert.equal(
            readdirSync(f.backup).filter(
              (name) => name !== "logs" && name !== ".update.lock",
            ).length,
            2,
          );
        } finally {
          cleanup(f.root);
        }
      },
    );
    await t.test("已有未提交修改时，不停止进程或更改代码", () => {
      const f = fixture();
      try {
        writeFileSync(path.join(f.work, "README.md"), "local changes\n");
        const result = run(f);
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /未提交修改/);
        assert.equal(git(f.work, "rev-parse", "HEAD"), f.oldSha);
        assert.ok(
          !existsSync(f.trace) ||
            !readFileSync(f.trace, "utf8").includes("pm2 stop"),
        );
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("PM2 版本提示位于进程列表前后时仍能完成更新", () => {
      const f = fixture();
      try {
        const banner =
          "\n\u001b[31m>>>> In-memory PM2 is out-of-date, do:\n" +
          ">>>> $ pm2 update\u001b[0m\n" +
          "In memory PM2 version: \u001b[34m5.3.0\u001b[0m\n" +
          "Local PM2 version: 5.4.0\n\n";
        const result = run(f, {
          MOCK_PM2_JLIST_PREFIX: banner,
          MOCK_PM2_JLIST_SUFFIX: banner,
        });
        assert.equal(result.status, 0, result.stderr + result.stdout);
        assert.equal(
          (result.stdout.match(/PM2 守护进程与当前 PM2 命令的版本不同/g) || []).length,
          3,
        );
        assert.equal(git(f.work, "rev-parse", "HEAD"), f.targetSha);
        const trace = readFileSync(f.trace, "utf8");
        assert.equal((trace.match(/pm2 jlist/g) || []).length, 3);
        assert.doesNotMatch(trace, /pm2 update|pm2 kill/);
        assert.match(trace, /pm2 restart/);
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("PM2 列表异常或命令失败时停止，且不泄露原始内容", () => {
      const secret = "private-pm2-test-secret-never-in-output";
      for (const [scenario, env] of [
        ["unknown prefix", { MOCK_PM2_JLIST_PREFIX: `[PM2] ${secret}\n` }],
        ["invalid json", { MOCK_PM2_JLIST_OVERRIDE: `[{"secret":"${secret}"` }],
        ["not an array", { MOCK_PM2_JLIST_OVERRIDE: `{"secret":"${secret}"}` }],
        ["command failed", { MOCK_PM2_JLIST_FAIL: "1" }],
      ]) {
        const f = fixture();
        try {
          const nextEnv = path.join(f.work, "apps", "cms", "next-env.d.ts");
          const generated = f.originalNextEnv.replaceAll("/dev/types/", "/types/");
          writeFileSync(nextEnv, generated);
          const result = run(f, env);
          assert.notEqual(result.status, 0, scenario);
          assert.match(result.stdout + result.stderr, /无法读取 PM2 进程列表/, scenario);
          assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret), scenario);
          assert.equal(readFileSync(nextEnv, "utf8"), generated, scenario);
          assert.equal(git(f.work, "rev-parse", "HEAD"), f.oldSha, scenario);
          assert.doesNotMatch(readFileSync(f.trace, "utf8"), /pm2 stop|pm2 update/, scenario);
        } finally {
          cleanup(f.root);
        }
      }
    });
    await t.test("更新前自动备份并恢复 Next.js 生成的类型路径", () => {
      const f = fixture();
      try {
        const nextEnv = path.join(f.work, "apps", "cms", "next-env.d.ts");
        const generated = f.originalNextEnv.replaceAll("/dev/types/", "/types/");
        writeFileSync(nextEnv, generated);
        const result = run(f);
        assert.equal(result.status, 0, result.stderr + result.stdout);
        assert.match(result.stdout, /发现 Next\.js 自动生成的类型路径变化/);
        assert.match(result.stdout, /已备份并恢复 Next\.js 自动生成的类型路径/);
        const backup = readdirSync(path.join(f.backup, "logs")).filter((name) =>
          name.startsWith("next-env-before-update-"),
        );
        assert.equal(backup.length, 1);
        assert.equal(
          readFileSync(path.join(f.backup, "logs", backup[0]), "utf8"),
          generated,
        );
        assert.equal(readFileSync(nextEnv, "utf8"), f.originalNextEnv);
        assert.equal(git(f.work, "rev-parse", "HEAD"), f.targetSha);
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("自定义构建目录的 Next.js 生成路径也能安全处理", () => {
      const f = fixture();
      try {
        const envFile = path.join(f.work, "apps", "cms", ".env");
        writeFileSync(envFile, `${readFileSync(envFile, "utf8")}NEXT_DIST_DIR=.next-custom\n`);
        const nextEnv = path.join(f.work, "apps", "cms", "next-env.d.ts");
        const changed = f.originalNextEnv.replaceAll(
          ".next/dev/types/",
          ".next-custom/types/",
        );
        writeFileSync(nextEnv, changed);
        const result = run(f, { MOCK_NEXT_DIST_DIR: ".next-custom" });
        assert.equal(result.status, 0, result.stderr + result.stdout);
        assert.match(result.stdout, /已备份并恢复 Next\.js 自动生成的类型路径/);
        assert.match(result.stdout, /已恢复 Next\.js 自动改写的类型声明路径/);
        assert.equal(readFileSync(nextEnv, "utf8"), f.originalNextEnv);
        const backup = readdirSync(path.join(f.backup, "logs")).find((name) =>
          name.startsWith("next-env-before-update-"),
        );
        assert.equal(readFileSync(path.join(f.backup, "logs", backup), "utf8"), changed);
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("Next.js 文件含其他改动、暂存或存在其他修改时不覆盖", () => {
      for (const scenario of ["custom", "different-path", "staged", "other-file"]) {
        const f = fixture();
        try {
          const nextEnv = path.join(f.work, "apps", "cms", "next-env.d.ts");
          let changed = f.originalNextEnv.replaceAll("/dev/types/", "/types/");
          if (scenario === "custom") changed += "// custom change\n";
          if (scenario === "different-path")
            changed = changed.replace("./.next/types/", "./other/types/");
          writeFileSync(nextEnv, changed);
          if (scenario === "staged") git(f.work, "add", "apps/cms/next-env.d.ts");
          if (scenario === "other-file")
            writeFileSync(path.join(f.work, "README.md"), "local changes\n");
          const result = run(f);
          assert.notEqual(result.status, 0, scenario);
          assert.match(result.stdout, /未提交修改/, scenario);
          assert.equal(readFileSync(nextEnv, "utf8"), changed, scenario);
          assert.equal(git(f.work, "rev-parse", "HEAD"), f.oldSha, scenario);
          assert.ok(
            !existsSync(f.trace) || !readFileSync(f.trace, "utf8").includes("pm2 stop"),
            scenario,
          );
        } finally {
          cleanup(f.root);
        }
      }
    });
    await t.test("指定版本不存在时停止，保留未处理的 Next.js 文件", () => {
      const f = fixture();
      try {
        const nextEnv = path.join(f.work, "apps", "cms", "next-env.d.ts");
        const changed = f.originalNextEnv.replaceAll("/dev/types/", "/types/");
        writeFileSync(nextEnv, changed);
        writeExecutable(
          path.join(f.env.MOCK_BIN, "node"),
          'if [[ "${1:-}" == "--version" ]]; then echo v0.0.0; exit; fi\nexec "$MOCK_REAL_NODE" "$@"',
        );
        const result = run(f, {
          MOCK_REAL_NODE: process.execPath,
          HOME: f.root,
          NVM_DIR: path.join(f.root, "missing-nvm"),
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /未找到项目要求的 Node/);
        assert.equal(readFileSync(nextEnv, "utf8"), changed);
        assert.equal(git(f.work, "rev-parse", "HEAD"), f.oldSha);
        assert.ok(
          !existsSync(f.trace) || !readFileSync(f.trace, "utf8").includes("pm2 stop"),
        );
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("从 NODE_BIN_DIR 自动选择已安装的指定 Node 版本", () => {
      const f = fixture();
      try {
        writeExecutable(
          path.join(f.env.MOCK_BIN, "node"),
          'if [[ "${1:-}" == "--version" ]]; then echo v0.0.0; exit; fi\nexec "$MOCK_REAL_NODE" "$@"',
        );
        const bin = path.join(f.root, "correct-node-bin");
        mkdirSync(bin);
        writeExecutable(path.join(bin, "node"), 'exec "$MOCK_REAL_NODE" "$@"');
        const nodeBin =
          process.platform === "win32"
            ? execFileSync(bash, ["-c", 'cygpath -u "$1"', "bash", bin], {
                encoding: "utf8",
              }).trim()
            : bin;
        const result = run(f, {
          MOCK_REAL_NODE: process.execPath,
          NODE_BIN_DIR: nodeBin,
        });
        assert.equal(result.status, 0, result.stderr + result.stdout);
        assert.match(result.stdout, /本次更新使用已安装的 Node/);
        assert.equal(git(f.work, "rev-parse", "HEAD"), f.targetSha);
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("本地提交未合入远端 main 时停止，不丢弃现有提交", () => {
      const f = fixture();
      try {
        writeFileSync(path.join(f.work, "README.md"), "local commit\n");
        git(f.work, "add", "README.md");
        git(f.work, "commit", "-m", "local only");
        const localSha = git(f.work, "rev-parse", "HEAD");
        const result = run(f);
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /不在远端 main 的历史中/);
        assert.equal(git(f.work, "rev-parse", "HEAD"), localSha);
        assert.ok(
          !existsSync(f.trace) ||
            !readFileSync(f.trace, "utf8").includes("pm2 stop"),
        );
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("终端和 PM2 配置不一致时停止，且不输出密钥", () => {
      const f = fixture();
      try {
        const result = run(f, {
          PAYLOAD_SECRET: "different-private-test-secret",
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /PAYLOAD_SECRET 配置不一致/);
        assert.doesNotMatch(
          result.stdout + result.stderr,
          /private-test-secret-never-in-output|different-private-test-secret/,
        );
        assert.doesNotMatch(readFileSync(f.trace, "utf8"), /pm2 stop/);
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("媒体队列超时会恢复旧后台，且不会开始更新", () => {
      const f = fixture();
      try {
        const database = new DatabaseSync(path.join(f.work, "test.db"));
        database.exec("UPDATE media SET processing_status = 'queued'");
        database.close();
        const result = run(f, { MEDIA_DRAIN_TIMEOUT_SECONDS: "0" });
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /等待媒体队列超时/);
        const trace = readFileSync(f.trace, "utf8");
        assert.match(trace, /pm2 stop anmy-cms/);
        assert.match(trace, /pm2 start anmy-cms/);
        assert.doesNotMatch(trace, /pm2 stop anmy-media|npm ci/);
        assert.equal(git(f.work, "rev-parse", "HEAD"), f.oldSha);
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("迁移失败保留备份和日志，不启动不匹配的新程序", () => {
      const f = fixture();
      try {
        const result = run(f, { MOCK_FAIL_MIGRATION: "1" });
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /mock migration failure/);
        assert.match(result.stdout, /未自动回滚或重启旧版本/);
        const trace = readFileSync(f.trace, "utf8");
        assert.match(trace, /npm run db:migrate/);
        assert.doesNotMatch(trace, /pm2 restart|pm2 start|pm2 save/);
        assert.ok(
          readdirSync(f.backup).some(
            (name) => name !== "logs" && name !== ".update.lock",
          ),
        );
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("数据库引用的本地素材目录缺失时恢复旧进程并停止", () => {
      const f = fixture();
      try {
        const envFile = path.join(f.work, "apps", "cms", ".env");
        const missing = path
          .join(f.work, "missing-media")
          .replaceAll("\\", "/");
        writeFileSync(
          envFile,
          readFileSync(envFile, "utf8").replace(
            /^MEDIA_ROOT=.*$/m,
            `MEDIA_ROOT=${missing}`,
          ),
        );
        const result = run(f);
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /本地素材，但素材目录不存在/);
        const trace = readFileSync(f.trace, "utf8");
        assert.match(trace, /pm2 start anmy-cms/);
        assert.match(trace, /pm2 start anmy-media/);
        assert.doesNotMatch(trace, /npm ci|pm2 restart/);
        assert.equal(git(f.work, "rev-parse", "HEAD"), f.oldSha);
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("健康检查失败会打印 PM2 日志且不保存启动清单", () => {
      const f = fixture();
      try {
        const result = run(f, { MOCK_FAIL_HEALTH: "1" });
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /本机后台健康检查失败/);
        const trace = readFileSync(f.trace, "utf8");
        assert.match(trace, /pm2 logs anmy-cms --lines 30 --nostream/);
        assert.match(trace, /pm2 logs anmy-media --lines 30 --nostream/);
        assert.doesNotMatch(trace, /pm2 save/);
      } finally {
        cleanup(f.root);
      }
    });
    await t.test("构建产生非预期源码改动时保留现场并停止", () => {
      const f = fixture();
      try {
        const result = run(f, { MOCK_UNEXPECTED_NEXT_ENV: "1" });
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /超出 Next.js 自动类型路径的变化/);
        assert.match(
          readFileSync(
            path.join(f.work, "apps", "cms", "next-env.d.ts"),
            "utf8",
          ),
          /unexpected change/,
        );
        assert.doesNotMatch(
          readFileSync(f.trace, "utf8"),
          /pm2 restart|pm2 save/,
        );
      } finally {
        cleanup(f.root);
      }
    });
  },
);
