import { mkdir, readFile, writeFile, access, chmod } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
await mkdir(".data/bin", { recursive: true });
try {
  await access(".env.local");
} catch {
  await writeFile(
    ".env.local",
    `ADMIN_TOKEN=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
}
const version = "1.9.1",
  arch = process.arch === "arm64" ? "arm64" : "amd64",
  name = `temporal_cli_${version}_linux_${arch}.tar.gz`;
const base = `https://github.com/temporalio/cli/releases/download/v${version}`;
try {
  execFileSync(".data/bin/temporal", ["--version"], { stdio: "ignore" });
} catch {
  execFileSync("curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--location",
    `${base}/${name}`,
    "--output",
    ".data/temporal.tar.gz",
  ]);
  execFileSync("curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--location",
    `${base}/checksums.txt`,
    "--output",
    ".data/checksums.txt",
  ]);
  const checks = await readFile(".data/checksums.txt", "utf8");
  const expected = checks
    .split("\n")
    .find((x) => x.endsWith(name))
    ?.split(/\s+/)[0];
  const actual = createHash("sha256")
    .update(await readFile(".data/temporal.tar.gz"))
    .digest("hex");
  if (!expected || actual !== expected)
    throw Error("Temporal checksum verification failed");
  execFileSync("tar", [
    "-xzf",
    ".data/temporal.tar.gz",
    "-C",
    ".data/bin",
    "temporal",
  ]);
  await chmod(".data/bin/temporal", 0o755);
}
console.log(
  "Local owner token generated if absent; Temporal CLI installed with checksum verification. Secrets are not printed.",
);
