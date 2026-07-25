import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Github, Mail, ExternalLink } from 'lucide-react';
import { Wordmark } from '@/shared/components/Wordmark';
import { Reveal } from '../shared/Reveal';

type ColumnLink = { label: string; href: string; external?: boolean };
type Column = { heading: string; links: ColumnLink[] };

const COLUMNS: Column[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Local Business', href: '#hub-local' },
      { label: 'Web Search', href: '#hub-web' },
      { label: 'AI SEO', href: '#hub-ai' },
      { label: 'Content', href: '#hub-content' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      {
        label: 'Release notes',
        href: 'https://sable-sky-9a6.notion.site/Release-Notes-2c53986bbd738095916ff5f4a622978d',
        external: true,
      },
      { label: 'API health', href: '/api/health', external: true },
      { label: 'Sign in', href: '/signin' },
      { label: 'Sign up', href: '/signup' },
    ],
  },
  {
    heading: 'Company',
    links: [
      {
        label: 'Contact',
        href: 'mailto:hello@seo-toolkit.local',
        external: true,
      },
      {
        label: 'Security',
        href: 'mailto:security@seo-toolkit.local',
        external: true,
      },
    ],
  },
];

export function LandingFooter() {
  const navigate = useNavigate();

  const onLink = (e: React.MouseEvent, link: ColumnLink) => {
    if (link.external) return;
    if (link.href.startsWith('#')) {
      e.preventDefault();
      const id = link.href.replace('#', '');
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    e.preventDefault();
    navigate(link.href);
  };

  return (
    <footer className="relative border-t border-border bg-surface-inset/60">
      {/* Oversized brand mark watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 select-none"
      >
        <motion.span
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 0.06, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="block text-[150px] sm:text-[220px] lg:text-[300px] font-semibold tracking-[-0.05em] leading-none text-foreground whitespace-nowrap uppercase"
        >
          Motionlinx
        </motion.span>
      </div>

      <div className="relative mx-auto max-w-[1280px] px-4 py-20 sm:px-6 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-12 lg:gap-16">
          {/* Brand col */}
          <Reveal className="flex flex-col gap-5">
            <Wordmark size="lg" />
            <p className="text-sm text-foreground-muted leading-relaxed max-w-xs">
              Motionlinx is the workspace for every growth toolkit. Start with
              the SEO Toolkit — more apps land here as we ship them.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-mint-ink/50 animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-mint-ink" />
              </span>
              <span className="text-xs text-foreground-muted">
                All systems operational
              </span>
            </div>
          </Reveal>

          {COLUMNS.map((col, i) => (
            <Reveal key={col.heading} delay={0.08 + i * 0.06}>
              <div className="flex flex-col gap-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
                  {col.heading}
                </h4>
                <ul className="flex flex-col gap-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={link.external ? '_blank' : undefined}
                        rel={link.external ? 'noopener noreferrer' : undefined}
                        onClick={(e) => onLink(e, link)}
                        className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-accent transition-colors"
                      >
                        {link.label}
                        {link.external && (
                          <ExternalLink className="size-3 opacity-60" />
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3} className="mt-16 pt-8 border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-foreground-muted">
            <span>&copy; 2026 Motionlinx · v0.6.0</span>
            <div className="flex items-center gap-4">
              <a
                href="mailto:hello@seo-toolkit.local"
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Mail className="size-3.5" /> Contact
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Github className="size-3.5" /> GitHub
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </footer>
  );
}
