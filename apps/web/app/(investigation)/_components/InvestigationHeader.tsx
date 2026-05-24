// activePath kept as an accepted (unused) prop so call sites that pass it
// don't need to change if the sidebar is the source of nav state.
export function InvestigationHeader({
  title,
  activePath: _activePath,
}: {
  title: string;
  activePath?: string;
}) {
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-5 md:px-20">
        <h1 className="font-display text-xl font-bold text-text-primary md:text-2xl">
          {title}
        </h1>
      </div>
    </header>
  );
}
