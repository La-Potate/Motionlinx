import { TopBar } from './TopBar';
import { AppFooter } from './AppFooter';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { cn } from '@/shared/lib/cn';

type Props = {
  children: React.ReactNode;
  /** When true, removes the standard inner padding + max-width wrapper so
   *  the page can take up the entire content area (e.g. the Whiteboard
   *  canvas). The TopBar and footer still render. */
  fullBleed?: boolean;
};

/**
 * Top-level chrome — mounted ONCE for the entire shelled area. Page
 * transitions live in routes.tsx (ShelledLayout) so the TopBar's mount
 * animation runs once on first load, not on every navigation.
 */
export function AppShell({ children, fullBleed = false }: Props) {
  const { open, setOpen } = useCommandPalette();

  return (
    <div
      className={cn(
        'flex flex-col bg-background text-foreground',
        // Full-bleed pages get a hard viewport-height frame so internal
        // calc()-based layouts (Whiteboard canvas) can't push the page into
        // a scroll. Standard pages keep their min-height behaviour.
        fullBleed ? 'h-screen overflow-hidden' : 'min-h-screen'
      )}
    >
      <TopBar onOpenCommand={() => setOpen(true)} />
      <main className="flex-1 flex flex-col min-h-0">
        {fullBleed ? (
          <div className="flex-1 flex flex-col min-h-0">{children}</div>
        ) : (
          <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
            {children}
          </div>
        )}
      </main>
      <AppFooter />
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
