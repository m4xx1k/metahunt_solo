import Link from "next/link";
import { Button, Logo, NavLink } from "@/components/ui-kit";
import { navLinks } from "@/lib/landing-data";

export function Header() {
  return (
    <header className="w-full px-6 py-5 md:px-20">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between">
        <Link href="/" aria-label="MetaHunt home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <Button variant="nav" size="sm">
          Coming soon🚀
        </Button>
      </div>
    </header>
  );
}
