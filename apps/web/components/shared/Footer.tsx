import {
  CrosshairIcon,
  GithubLogoIcon,
  PaperPlaneTiltIcon,
} from "@phosphor-icons/react/dist/ssr";

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-bg-elev px-6 py-10 md:px-20">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-between gap-10 md:flex-row md:gap-0">
        <div className="flex flex-col items-center gap-2.5 md:flex-row md:gap-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-accent text-bg">
              <CrosshairIcon weight="bold" className="h-3.5 w-3.5" />
            </div>
            <span className="font-mono text-sm text-text-muted">
              metahunt · йоу
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-[18px]">
          <a
            href="#"
            className="font-body text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            продукт
          </a>
          <a
            href="#roadmap"
            className="font-body text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            roadmap
          </a>
          <a
            href="https://t.me/m4xx1k"
            className="font-body text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            для партнерів
          </a>
        </nav>

        <div className="flex items-center gap-[18px]">
          <a
            href="https://github.com/m4xx1k"
            aria-label="GitHub"
            className="text-text-secondary transition-colors hover:text-text-primary"
          >
            <GithubLogoIcon weight="bold" className="h-4 w-4" />
          </a>
          <a
            href="https://t.me/m4xx1k"
            aria-label="Telegram"
            className="text-text-secondary transition-colors hover:text-text-primary"
          >
            <PaperPlaneTiltIcon weight="bold" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
