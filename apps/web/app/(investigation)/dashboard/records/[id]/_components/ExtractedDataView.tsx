export function ExtractedDataView({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return (
      <p className="font-mono text-sm text-text-muted">
        no extracted data — record was not processed yet
      </p>
    );
  }
  return (
    <pre className="overflow-x-auto border border-border bg-bg-elev p-4 font-mono text-xs leading-relaxed text-text-primary">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
