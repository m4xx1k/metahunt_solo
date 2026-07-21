import Link from "next/link";
import {
  CrosshairIcon,
  GithubLogoIcon,
  LinkedinLogoIcon,
  PaperPlaneTiltIcon,
} from "@phosphor-icons/react/dist/ssr";

// linktree — "built by" socials.
const SOCIALS = [
  { label: "GitHub", href: "https://github.com/m4xx1k", Icon: GithubLogoIcon },
  { label: "Telegram", href: "https://t.me/m4xx1k", Icon: PaperPlaneTiltIcon },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/maksym-fabin",
    Icon: LinkedinLogoIcon,
  },
];

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-bg-elev px-6 py-10 md:px-20">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-between gap-8 md:flex-row md:gap-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-accent text-bg">
            <CrosshairIcon weight="bold" className="h-3.5 w-3.5" />
          </div>
          <span className="font-mono text-sm text-text-muted">metahunt · yo</span>
        </div>

        <nav className="flex items-center gap-[18px]">
          <Link
            href="/"
            className="font-body text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            the market
          </Link>
          <Link
            href="/how-it-works"
            className="font-body text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            how it works
          </Link>
          <Link
            href="/privacy"
            className="font-body text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            privacy
          </Link>
        </nav>

        <div className="flex items-center gap-3.5">
          <span className="font-mono text-xs text-text-muted">built by @m4xx1k</span>
          {SOCIALS.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary transition-colors hover:text-text-primary"
            >
              <Icon weight="bold" className="h-4 w-4" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
