// BAML's native binding leaves a CustomGC handle that prevents Node from
// exiting on its own. Force a clean exit after all tests so Jest doesn't
// print "did not exit" / "Force exiting" reminders.
export default async function teardown(): Promise<void> {
  process.exit(0);
}
