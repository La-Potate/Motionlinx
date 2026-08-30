import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { KeyHint } from '@/shared/components/KeyHint';
import { BreadcrumbNav } from './BreadcrumbNav';
import { PrimaryNav } from './PrimaryNav';
import { CreditsWidget } from './CreditsWidget';
import { UserMenu } from './UserMenu';
import { Wordmark } from '@/shared/components/Wordmark';
import { cn } from '@/shared/lib/cn';

type Props = {
  onOpenCommand: () => void;
};

export function TopBar({ onOpenCommand }: Props) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full',
        'transition-[background-color,border-color,box-shadow] duration-200',
        scrolled
          ? 'border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 shadow-elevation-sm'
          : 'border-b border-transparent bg-background'
      )}
    >
      <div
        className="mx-auto h-14 w-full max-w-[1600px] px-4 sm:px-6 grid items-center gap-4"
        style={{
          // Three-track grid: left (logo + breadcrumb), center (primary nav),
          // right (utility cluster). Center column stays put regardless of
          // sibling content length — no reflow.
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        }}
      >
        {/* LEFT — logo + breadcrumb */}
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity hover:opacity-80"
            aria-label="Go to dashboard"
          >
            <Wordmark size="md" />
          </button>
          <span className="hidden lg:block h-5 w-px bg-border" />
          <div className="hidden lg:block min-w-0 flex-1">
            <BreadcrumbNav />
          </div>
        </div>

        {/* CENTER — primary nav, position-stable */}
        <div className="justify-self-center">
          <PrimaryNav />
        </div>

        {/* RIGHT — utility cluster */}
        <div className="flex items-center gap-1.5 justify-self-end min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCommand}
            className="hidden sm:flex h-8 gap-2 pl-2.5 pr-1.5 text-foreground-muted"
          >
            <Search className="size-3.5" />
            <span className="hidden md:inline text-xs">Search</span>
            <KeyHint keys={[isMac ? '⌘' : 'Ctrl', 'K']} className="ml-2" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenCommand}
            className="sm:hidden"
            aria-label="Open command palette"
          >
            <Search className="size-4" />
          </Button>

          <CreditsWidget />

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
