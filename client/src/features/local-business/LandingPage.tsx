import { HubLanding } from '@/shared/components/HubLanding';

// Content comes from app/nav-config so this hub, the dashboard and each
// tool page can never describe the same tool differently.
export default function LocalBusinessLandingPage() {
  return <HubLanding sectionId="local-business" />;
}
