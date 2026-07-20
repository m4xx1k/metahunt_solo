export function InvestigationHeader({ title }: { title: string }) {
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-6 md:px-20">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
          {title}
        </h1>
      </div>
    </header>
  );
}
