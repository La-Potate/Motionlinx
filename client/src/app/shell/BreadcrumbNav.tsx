import { Fragment } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ALL_TOOLS, PRIMARY_TABS } from '@/app/nav-config';
import { cn } from '@/shared/lib/cn';

type Crumb = { id: string; label: string; path: string | null };

/**
 * Static breadcrumb — no per-crumb mount animation. The header doesn't
 * move on navigation; crumbs swap immediately so the focus stays on the
 * page-level content morph.
 */
export function BreadcrumbNav() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname || '/';
  const primary = PRIMARY_TABS.find(
    (t) => path === t.path || path.startsWith(`${t.path}/`)
  );
  const tool = ALL_TOOLS.find((t) => t.path === path);

  const crumbs: Crumb[] = [
    { id: 'user', label: user?.username || 'You', path: null },
  ];
  if (primary)
    crumbs.push({
      id: `primary-${primary.id}`,
      label: primary.label,
      path: primary.path,
    });
  if (tool && tool.label !== primary?.label)
    crumbs.push({ id: `tool-${tool.id}`, label: tool.label, path: null });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0">
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={crumb.id}>
            {i > 0 && (
              <ChevronRight className="size-3.5 text-foreground-subtle shrink-0" />
            )}
            {crumb.path ? (
              <button
                type="button"
                onClick={() => navigate(crumb.path!)}
                className={cn(
                  'text-sm font-medium text-foreground-muted hover:text-foreground transition-colors truncate',
                  last && 'text-foreground'
                )}
              >
                {crumb.label}
              </button>
            ) : (
              <span
                className={cn(
                  'text-sm truncate',
                  last ? 'font-medium text-foreground' : 'text-foreground-muted'
                )}
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
