import { lazy, Suspense } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/app/shell/AppShell';
import { PageSkeleton } from '@/shared/components/PageSkeleton';
import { PageTransition } from '@/shared/components/PageTransition';
import LoadingScreen from '@/shared/components/LoadingScreen';

// Public marketing
const LandingPage = lazy(() => import('@/features/landing/LandingPage'));

// Auth + shared
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const TrialNoticePage = lazy(() => import('@/features/auth/TrialNoticePage'));
const SharedSiteMarkerPage = lazy(
  () => import('@/features/web-search/SharedSiteMarkerPage')
);

// Dashboard — the single post-login surface. Replaces the old
// /toolkit -> /seo-toolkit -> hub -> tool chain with one organised page.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));

// AI Traffic Report (separate Motionlinx app, sibling to SEO Toolkit)
const AiTrafficReportPage = lazy(
  () => import('@/features/ai-traffic-report/AiTrafficReportPage')
);

// AI Assistant (full SEO analysis driven by GSC + DataForSEO)
const AiAssistantPage = lazy(
  () => import('@/features/ai-assistant/AiAssistantPage')
);
const LocalBusinessLanding = lazy(
  () => import('@/features/local-business/LandingPage')
);
const WebSearchLanding = lazy(() => import('@/features/web-search/LandingPage'));
const AiSeoLanding = lazy(() => import('@/features/ai-seo/LandingPage'));
const ContentLanding = lazy(() => import('@/features/content/LandingPage'));

// Settings / admin / billing
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const AdminPage = lazy(() => import('@/features/admin/AdminPage'));
const PricingPage = lazy(() => import('@/features/billing/PricingPage'));

// Local Business tools
const LocalResearchPage = lazy(
  () => import('@/features/local-business/LocalResearchPage')
);
const GbaAuditPage = lazy(() => import('@/features/local-business/GbaAuditPage'));
const GbaComparePage = lazy(
  () => import('@/features/local-business/GbaComparePage')
);
const HeatmapPage = lazy(() => import('@/features/local-business/HeatmapPage'));
const RankTrackerPage = lazy(
  () => import('@/features/local-business/RankTrackerPage')
);
const CitationsPage = lazy(() => import('@/features/local-business/CitationsPage'));

// Web Search tools
const SiteMarkerPage = lazy(() => import('@/features/web-search/SiteMarkerPage'));
const PageCommenterPage = lazy(
  () => import('@/features/web-search/PageCommenterPage')
);
const MapElementPage = lazy(() => import('@/features/web-search/MapElementPage'));
const SchemaGeneratorPage = lazy(
  () => import('@/features/web-search/SchemaGeneratorPage')
);
const TechnicalAuditPage = lazy(
  () => import('@/features/web-search/TechnicalAuditPage')
);
const BulkIndexPage = lazy(() => import('@/features/web-search/BulkIndexPage'));
const BulkHttpPage = lazy(() => import('@/features/web-search/BulkHttpPage'));
const SiteTreePage = lazy(() => import('@/features/web-search/SiteTreePage'));

// AI SEO tools
const AiKeywordDataPage = lazy(() => import('@/features/ai-seo/AiKeywordDataPage'));
const AiOptimizationPage = lazy(
  () => import('@/features/ai-seo/AiOptimizationPage')
);
const CrawlerAccessPage = lazy(() => import('@/features/ai-seo/CrawlerAccessPage'));
const LlmValidatorPage = lazy(() => import('@/features/ai-seo/LlmValidatorPage'));
const AnswerAiPage = lazy(() => import('@/features/ai-seo/AnswerAiPage'));

// Content tools
const PressReleasePage = lazy(() => import('@/features/content/PressReleasePage'));
const BlogPostPage = lazy(() => import('@/features/content/BlogPostPage'));
const BeyondIntentPage = lazy(() => import('@/features/content/BeyondIntentPage'));

/* =========================================================================
   Layout components — the AppShell is mounted ONCE for the entire
   protected/shelled section. Route changes only swap the <Outlet />
   contents, so the TopBar's mount animation runs exactly once on first
   load instead of replaying on every navigation.
   ========================================================================= */

function ShelledLayout() {
  const location = useLocation();
  return (
    <AppShell>
      <Suspense fallback={<PageSkeleton />}>
        {/* mode="wait" — old page fully exits before the new one mounts, so
            no ghost copies linger below the fold. Shared layoutId still
            morphs the tool icon across routes via motion's saved-rect
            tracking inside LayoutGroup. */}
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </Suspense>
    </AppShell>
  );
}

function GuardedShell({ requireAdmin = false }: { requireAdmin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingScreen
          message="Preparing your workspace"
          subMessage="Authenticating your session."
        />
      </div>
    );
  }
  if (!user) return <Navigate to="/signin" replace />;
  if (requireAdmin && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (user.role === 'trial' && !requireAdmin) return <Navigate to="/trial" replace />;
  return <ShelledLayout />;
}

function TrialGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingScreen
          message="Preparing your workspace"
          subMessage="Authenticating your session."
        />
      </div>
    );
  }
  if (!user) return <Navigate to="/signin" replace />;
  return children as React.ReactElement;
}

export function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Public — marketing landing + auth + public share link */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<LoginPage />} />
        <Route path="/signup" element={<LoginPage initialTab="signup" />} />
        <Route
          path="/shared/site-marker/:shareToken"
          element={<SharedSiteMarkerPage />}
        />

        {/* Authenticated but outside the shell */}
        <Route
          path="/trial"
          element={
            <TrialGuard>
              <TrialNoticePage />
            </TrialGuard>
          }
        />
        <Route
          path="/pricing"
          element={
            <TrialGuard>
              <PricingPage />
            </TrialGuard>
          }
        />

        {/* Shelled — AppShell mounted once */}
        <Route element={<GuardedShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* Legacy paths. /toolkit and /seo-toolkit were two separate card
              pages that only existed to link onward; /dashboard now does
              that job directly. Kept as redirects so old links survive. */}
          <Route path="/seo-toolkit" element={<Navigate to="/dashboard" replace />} />
          <Route path="/toolkit" element={<Navigate to="/dashboard" replace />} />
          <Route path="/home" element={<Navigate to="/dashboard" replace />} />
          <Route path="/ai-traffic-report" element={<AiTrafficReportPage />} />
          <Route path="/AI-Assistant" element={<AiAssistantPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Local Business */}
          <Route path="/local-business" element={<LocalBusinessLanding />} />
          <Route path="/local-business/keyword" element={<LocalResearchPage />} />
          <Route
            path="/local-business/google-business-audit"
            element={<GbaAuditPage />}
          />
          <Route
            path="/local-business/google-business-compare"
            element={<GbaComparePage />}
          />
          <Route path="/local-business/heatmap" element={<HeatmapPage />} />
          <Route path="/local-business/rank-tracker" element={<RankTrackerPage />} />
          <Route path="/local-business/citations" element={<CitationsPage />} />

          {/* Web Search */}
          <Route path="/web-search" element={<WebSearchLanding />} />
          <Route path="/web-search/site-marker" element={<SiteMarkerPage />} />
          <Route path="/web-search/page-commenter" element={<PageCommenterPage />} />
          <Route path="/web-search/map-element" element={<MapElementPage />} />
          <Route
            path="/web-search/schema-generator"
            element={<SchemaGeneratorPage />}
          />
          <Route
            path="/web-search/technical-audit"
            element={<TechnicalAuditPage />}
          />
          <Route
            path="/web-search/bulk-index-checker"
            element={<BulkIndexPage />}
          />
          <Route
            path="/web-search/bulk-http-checker"
            element={<BulkHttpPage />}
          />
          <Route path="/web-search/site-tree" element={<SiteTreePage />} />

          {/* AI SEO */}
          <Route path="/ai-seo" element={<AiSeoLanding />} />
          <Route path="/ai-seo/keyword-data" element={<AiKeywordDataPage />} />
          <Route
            path="/ai-seo/ai-optimization"
            element={<AiOptimizationPage />}
          />
          <Route
            path="/ai-seo/crawler-access-checker"
            element={<CrawlerAccessPage />}
          />
          <Route path="/ai-seo/llms-validator" element={<LlmValidatorPage />} />
          <Route path="/ai-seo/answer-ai" element={<AnswerAiPage />} />

          {/* Content */}
          <Route path="/content" element={<ContentLanding />} />
          <Route path="/content/beyond-intent" element={<BeyondIntentPage />} />
          <Route path="/content/press-release" element={<PressReleasePage />} />
          <Route path="/content/blog-post" element={<BlogPostPage />} />
        </Route>

        {/* Admin (admin-only, same shell) */}
        <Route element={<GuardedShell requireAdmin />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
