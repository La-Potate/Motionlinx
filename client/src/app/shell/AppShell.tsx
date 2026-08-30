import { TopBar } from './TopBar';
import { AppFooter } from './AppFooter';
import { CommandPalette, useCommandPalette } from './CommandPalette';

type Props = {
  children: React.ReactNode;
};

/**
 * Top-level chrome — mounted ONCE for the entire shelled area. Page
 * transitions live in routes.tsx (ShelledLayout) so the TopBar's mount
 * animation runs once on first load, not on every navigation.
 */
export function AppShell({ children }: Props) {
  const { open, setOpen } = useCommandPalette();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar onOpenCommand={() => setOpen(true)} />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
          {children}
        </div>
      </main>
      <AppFooter />
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
