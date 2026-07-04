import type { ReactNode } from "react";
import Link from "next/link";
import { Button, Logo, NavLink } from "@/ui";

export type NavItem = { label: string; href: string };

// `cta` fills the top-right slot. Omitted → the reverse-ATS button (the default
// on the classic feed / marketing pages); pass `null` to drop it (e.g. /merged,
// which has upload built in).
export function Header({ links, cta }: { links?: NavItem[]; cta?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-bg/80 px-6 py-4 backdrop-blur-md md:px-12">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between">
        <Link href="/" aria-label="MetaHunt home">
          <Logo />
        </Link>
        {links && links.length > 0 && (
          <nav className="hidden items-center gap-8 md:flex">
            {links.map((link) => (
              <NavLink key={link.href} href={link.href}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
        {cta === undefined ? (
          <Link href="/reverse-ats" aria-label="reverse-ATS — jobs matched to your CV">
            <Button variant="nav" size="sm">
              match my CV →
            </Button>
          </Link>
        ) : (
          cta
        )}
      </div>
    </header>
  );
}
