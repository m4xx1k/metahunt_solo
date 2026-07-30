const ITEMS = [
  { href: "#subscriptions", label: "підписки" },
  { href: "#cv", label: "CV" },
  { href: "#account", label: "акаунт" },
] as const;

export function AccountNav() {
  return (
    <nav aria-label="Кабінет" className="lg:sticky lg:top-24 lg:self-start">
      <p className="mb-3 font-mono text-2xs uppercase tracking-widest text-text-muted">кабінет</p>
      <ul className="flex gap-2 overflow-x-auto lg:flex-col">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="block border border-border bg-bg-card px-4 py-2 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary lg:min-w-44"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
