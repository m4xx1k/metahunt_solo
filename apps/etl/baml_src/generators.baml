// Generates a TypeScript client into apps/etl/src/baml_client/.
// Keeping it inside src/ ensures `nest build` / `tsc` picks it up
// without extra include paths or path aliases.
generator target {
    output_type "typescript"
    output_dir "../src"
    version "0.222.0"
    default_client_mode async
}
