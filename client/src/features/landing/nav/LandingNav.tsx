import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wordmark } from '@/shared/components/Wordmark';
import { AccountButton } from './AccountButton';
import { cn } from '@/shared/lib/cn';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
];

/**
 * Sticky landing nav. At the top it's a full-width transparent bar; once the
 * user scrolls past the hero it morphs into a centered, floating glass pill.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const id = href.replace('#', '');
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        className={cn(
          'pointer-events-auto mx-auto flex w-full items-center justify-between gap-6',
          'transition-[max-width,height,margin-top,padding,border-radius,background-color,border-color,box-shadow,backdrop-filter]',
          'duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] will-change-[max-width,margin-top]',
          scrolled
            ? [
                'mt-3 h-14 max-w-[760px] pl-4 pr-2 sm:pl-5 sm:pr-2',
                'rounded-full border border-border/60',
                'bg-background/55 supports-[backdrop-filter]:bg-background/35 backdrop-blur-xl',
                'shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)]',
              ].join(' ')
            : [
                'mt-0 h-16 max-w-[1280px] px-0 sm:px-2',
                'rounded-none border border-transparent',
                'bg-transparent backdrop-blur-0',
                'shadow-none',
              ].join(' ')
        )}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity hover:opacity-80"
          aria-label="Home"
        >
          <Wordmark size="md" />
        </button>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={scrollTo(link.href)}
              className="px-3 py-1.5 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors rounded-md hover:bg-surface-muted/60"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <AccountButton />
      </div>
    </header>
  );
}
