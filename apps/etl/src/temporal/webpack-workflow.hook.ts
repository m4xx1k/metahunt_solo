// Temporal's workflow bundler ships its own webpack config; we append a
// ts-loader rule (transpile-only) so workflows authored in TypeScript get
// compiled inside the bundle without dragging the full type-check graph in.
export function appendTsLoaderRule(
  cfg: Record<string, unknown>,
): Record<string, unknown> {
  const mod = (cfg.module ?? {}) as Record<string, unknown>;
  const rules = (mod.rules ?? []) as unknown[];
  return {
    ...cfg,
    module: {
      ...mod,
      rules: [
        ...rules,
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: require.resolve("ts-loader"),
              options: { transpileOnly: true },
            },
          ],
        },
      ],
    },
  };
}
