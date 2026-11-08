import { spawnSync } from "node:child_process";
import process from "node:process";

for (const TZ of [
  "America/Montevideo",
  "Pacific/Kiritimati",
  "America/Los_Angeles",
]) {
  console.log(`Timezone: ${TZ}`);
  const result = spawnSync(
    process.execPath,
    ["--test", "tests/contracts.test.ts"],
    {
      env: { ...process.env, TZ },
      stdio: "inherit",
      shell: false,
    },
  );
  if (result.error || result.status !== 0) process.exit(1);
}
