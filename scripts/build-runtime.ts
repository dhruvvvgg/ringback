import { build } from "esbuild";
await build({
  entryPoints: {
    server: "apps/server/src/index.ts",
    worker: "apps/worker/src/index.ts",
    supervisor: "scripts/supervisor.ts",
  },
  outdir: "dist",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
});
console.log("Production server, worker and supervisor compiled.");
