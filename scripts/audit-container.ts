import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const name = process.argv[2] || "ringback-capped";
const samples: any[] = [];
for (let i = 0; i < 18; i++) {
  const state = JSON.parse(
    execFileSync("docker", ["inspect", name, "--format", "{{json .State}}"], {
      encoding: "utf8",
    }),
  );
  if (!state.Running || state.OOMKilled)
    throw Error("Capped container stopped or OOM killed");
  const stats = JSON.parse(
    execFileSync(
      "docker",
      ["stats", "--no-stream", "--format", "{{json .}}", name],
      { encoding: "utf8" },
    ),
  );
  samples.push({
    at: new Date().toISOString(),
    memory: stats.MemUsage,
    cpu: stats.CPUPerc,
  });
  if (i === 1)
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/smoke.ts", "http://localhost:3200"],
      { stdio: "inherit" },
    );
  await new Promise((r) => setTimeout(r, 5000));
}
await mkdir("artifacts/deploy", { recursive: true });
await writeFile(
  "artifacts/deploy/container-memory.json",
  JSON.stringify(
    {
      mode: "local-docker",
      memoryLimit: "512 MiB",
      passed: true,
      samples,
      limitation:
        "Short synthetic demo load; not a capacity benchmark or Render deployment proof",
    },
    null,
    2,
  ),
);
console.log("Capped-container smoke and observation passed.");
