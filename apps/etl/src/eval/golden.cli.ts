// Golden-set eval harness for vacancy extraction (MET-24). See md/runbook/.
import { sample } from "./commands/sample";

const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = { sample };

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
