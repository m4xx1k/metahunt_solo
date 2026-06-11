import Link from "next/link";
import { Button, Logo, NavLink } from "@/ui";

export type NavItem = { label: string; href: string };

export function Header({ links }: { links?: NavItem[] }) {
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
        <Link href="/reverse-ats" aria-label="reverse-ATS — вакансії під твоє CV">
          <Button variant="nav" size="sm">
            під моє CV →
          </Button>
        </Link>
      </div>
    </header>
  );
}
