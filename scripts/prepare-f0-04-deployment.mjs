import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, lstat, realpath } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import {
  deploymentFiles,
  deploymentPackage,
  digestFiles,
} from "./f0-04-deployment-lib.mjs";

// Local-only preparation. There is deliberately no deploy/link/env-upload command.
const root = fileURLToPath(new URL("../", import.meta.url));
const name = `f0-04-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
const destination = resolve(root, ".deployment", name);
const rel = relative(root, destination);
if (isAbsolute(rel) || rel.startsWith(".."))
  throw new Error("Destino fuera del repositorio");
try {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const selected = deploymentFiles(tracked);
  for (const required of [
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "src/app/page.tsx",
    "src/server/auth.ts",
  ])
    if (!selected.includes(required)) throw new Error("Fuente incompleta");
  const rows = [];
  const base = resolve(root, ".deployment");
  await mkdir(base).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  if (!(await lstat(base)).isDirectory() || (await realpath(base)) !== base)
    throw new Error("Destino no regular");
  await mkdir(destination);
  for (const name of selected) {
    const source = resolve(root, name);
    if (!(await lstat(source)).isFile()) throw new Error("Fuente no regular");
    let content = await readFile(source);
    if (name === "package.json")
      content = Buffer.from(
        JSON.stringify(deploymentPackage(JSON.parse(content)), null, 2) + "\n",
      );
    if (name === "tsconfig.json") {
      const config = JSON.parse(content);
      config.include = [
        "next-env.d.ts",
        "src/**/*.ts",
        "src/**/*.tsx",
        ".next/types/**/*.ts",
        ".next/dev/types/**/*.ts",
      ];
      config.exclude = ["node_modules"];
      content = Buffer.from(JSON.stringify(config, null, 2) + "\n");
    }
    const target = resolve(destination, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { flag: "wx" });
    rows.push({
      path: name,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  for (const [source, name] of [
    ["vercel.json", "vercel.json"],
    ["vercelignore", ".vercelignore"],
  ]) {
    const content = await readFile(resolve(root, "deployment/f0-04", source));
    await writeFile(resolve(destination, name), content, { flag: "wx" });
    rows.push({
      path: name,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  const manifest = {
    ticket: "F0-04",
    preparedAt: new Date().toISOString(),
    directory: rel.replaceAll("\\", "/"),
    files: rows,
    sha256: digestFiles(rows),
    published: false,
    secretsIncluded: false,
    authEnabled: false,
    remoteMigration: false,
  };
  await writeFile(
    resolve(destination, "deployment-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify({ ...manifest, files: rows.length }, null, 2));
} catch {
  console.error(
    "No se pudo preparar el paquete local F0-04; no se publicó nada.",
  );
  process.exitCode = 1;
}
