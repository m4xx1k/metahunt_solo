// Golden-set eval harness for vacancy extraction (MET-24). See md/runbook/.
import { arbitrate } from "./commands/arbitrate";
import { batch } from "./commands/batch";
import { merge } from "./commands/merge";
import { releaseCheck } from "./commands/release-check";
import { review } from "./commands/review";
import { sample } from "./commands/sample";
import { score } from "./commands/score";
import { snapshot } from "./commands/snapshot";
import { validate } from "./commands/validate";

const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = {
  sample,
  snapshot,
  batch,
  merge,
  arbitrate,
  review,
  score,
  validate,
  "release-check": releaseCheck,
};

async function main(): Promise<void> {
  const [name, ...argv] = process.argv.slice(2);
  const command = name ? COMMANDS[name] : undefined;
  if (!command) {
    console.error(`usage: golden <${Object.keys(COMMANDS).join("|")}> [options]`);
    process.exit(2);
  }
  await command(argv);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
