import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const script = new URL("../setup.mjs", import.meta.url);

for (const ending of ["\n", "\r\n"]) {
  test(`setup generates a secret and preserves existing configuration (${JSON.stringify(ending)})`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mylife-setup-test-"));
    try {
      for (const dir of ["scripts", "apps/cms", "apps/web"])
        mkdirSync(path.join(root, dir), { recursive: true });
      copyFileSync(script, path.join(root, "scripts", "setup.mjs"));
      writeFileSync(path.join(root, "apps/cms/.env.example"), `PAYLOAD_SECRET=${ending}MEDIA_STORAGE=local${ending}`);
      writeFileSync(path.join(root, "apps/web/.env.example"), `CMS_INTERNAL_URL=http://localhost:3001${ending}`);
      const setup = path.join(root, "scripts", "setup.mjs");
      execFileSync(process.execPath, [setup]);
      const cmsPath = path.join(root, "apps/cms/.env");
      const first = readFileSync(cmsPath, "utf8");
      assert.match(first, /^PAYLOAD_SECRET=[a-f0-9]{64}\r?$/m);
      assert.ok(first.includes(`MEDIA_STORAGE=local${ending}`));
      execFileSync(process.execPath, [setup]);
      assert.equal(readFileSync(cmsPath, "utf8"), first);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("setup refuses a template without an empty secret placeholder", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mylife-setup-test-"));
  try {
    for (const dir of ["scripts", "apps/cms", "apps/web"])
      mkdirSync(path.join(root, dir), { recursive: true });
    copyFileSync(script, path.join(root, "scripts", "setup.mjs"));
    writeFileSync(path.join(root, "apps/cms/.env.example"), "MEDIA_STORAGE=local\n");
    writeFileSync(path.join(root, "apps/web/.env.example"), "\n");
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "setup.mjs")], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PAYLOAD_SECRET/);
    assert.throws(() => readFileSync(path.join(root, "apps/cms/.env")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
