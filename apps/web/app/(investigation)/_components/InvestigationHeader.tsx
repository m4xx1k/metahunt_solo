export function InvestigationHeader({ title }: { title: string }) {
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
