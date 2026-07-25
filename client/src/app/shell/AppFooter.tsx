import { Wordmark } from '@/shared/components/Wordmark';

export function AppFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-4 px-4 text-xs text-foreground-muted sm:px-6">
        <div className="flex items-center gap-3">
          <Wordmark size="sm" />
          <span className="text-foreground-subtle">·</span>
          <span>&copy; 2026</span>
          <span className="hidden sm:inline text-foreground-subtle">·</span>
          <span className="hidden sm:inline">v0.6.0</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://sable-sky-9a6.notion.site/Release-Notes-2c53986bbd738095916ff5f4a622978d"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Release notes
          </a>
        </div>
      </div>
    </footer>
  );
}
