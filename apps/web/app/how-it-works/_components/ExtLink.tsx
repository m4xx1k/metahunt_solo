export function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-secondary underline decoration-accent-secondary/30 underline-offset-2 hover:decoration-accent-secondary"
    >
      {children}
    </a>
  );
}
