import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ExternalLink, ShieldAlert, Globe } from 'lucide-react';
import siteMarkerService from '@/shared/api/siteMarker';
import { PageAnnotator } from '@/shared/components/PageAnnotator';
import { Card, CardContent } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { Wordmark } from '@/shared/components/Wordmark';

export default function SharedSiteMarkerPage() {
  const { shareToken } = useParams();
  const [data, setData] = useState<any>(null);
  // The endpoint returns the captured html and its markers; this page used
  // to discard both and frame the live URL instead, so a recipient saw the
  // current site with none of the annotations that were shared with them.
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const payload = await siteMarkerService.getSharedPage(shareToken);
        setData(payload?.page || payload);
        setHtml(payload?.html || '');
      } catch (err: any) {
        setError(err?.message || 'Failed to load shared page');
      } finally {
        setLoading(false);
      }
    })();
  }, [shareToken]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark size="md" />
          <Badge variant="accent">Shared via Site Marker</Badge>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
        {loading ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-6">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-[480px] mt-3" />
            </CardContent>
          </Card>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-rose">
              <CardContent className="flex items-start gap-3 p-6">
                <ShieldAlert className="size-5 text-rose-ink shrink-0" />
                <div>
                  <h2 className="text-base font-semibold tracking-tight">
                    Shared link unavailable
                  </h2>
                  <p className="text-sm text-foreground-muted mt-1">{error}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : data ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32 }}
            className="flex flex-col gap-4"
          >
            <Card>
              <CardContent className="p-5">
                <h1 className="text-xl font-semibold tracking-tight">
                  {data.title || 'Shared page'}
                </h1>
                {data.url && (
                  <a
                    href={data.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent hover:underline inline-flex items-center gap-1 mt-1.5"
                  >
                    <Globe className="size-3" />
                    {data.url}
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                {html ? (
                  <PageAnnotator
                    html={html}
                    annotations={Array.isArray(data.markers) ? data.markers : []}
                    onSave={() => {}}
                    readOnly
                  />
                ) : (
                  <p className="text-sm text-foreground-muted">
                    This shared capture has no stored page content.
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
