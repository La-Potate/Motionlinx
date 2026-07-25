import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldAlert, ArrowRight, LogOut, Check, X, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

export default function TrialNoticePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/signin', { replace: true });
    }
  };

  const bullets = [
    { Icon: Check, text: 'Account is reserved and ready for activation', tone: 'mint' as const },
    { Icon: X, text: 'Tooling, automations and API workflows stay disabled', tone: 'rose' as const },
    { Icon: MessageCircle, text: 'Contact us to unlock Business or Personal access', tone: 'sky' as const },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl"
      >
        <Card className="p-8 shadow-elevation-md">
          <div className="flex flex-col items-start gap-6">
            <div className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-pressed">
              <ShieldAlert className="size-5" strokeWidth={1.75} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Trial · Locked
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Tools are locked for trial accounts
              </h1>
              <p className="text-sm text-foreground-muted leading-relaxed">
                {user?.username ? `Hi ${user.username}, your` : 'Your'} Motionlinx account
                has been created under the Trial level. Trial users can sign in and explore
                onboarding, but research, ranking, schema, and automation tools stay disabled
                until upgraded.
              </p>
            </div>

            <ul className="flex flex-col gap-2 w-full">
              {bullets.map(({ Icon, text, tone }, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.32, delay: 0.1 + i * 0.06 }}
                  className="flex items-start gap-2.5 rounded-md bg-surface-muted px-3 py-2.5"
                >
                  <span
                    className={`flex size-5 items-center justify-center rounded-full bg-${tone} text-${tone}-ink shrink-0 mt-0.5`}
                  >
                    <Icon className="size-3" strokeWidth={2.5} />
                  </span>
                  <span className="text-sm text-foreground">{text}</span>
                </motion.li>
              ))}
            </ul>

            <div className="flex w-full gap-2 mt-2">
              <Button asChild size="lg" className="flex-1">
                <a href="mailto:admin@seo-toolkit.local?subject=Upgrade%20my%20trial%20account">
                  Contact sales
                  <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button variant="outline" size="lg" onClick={onLogout}>
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
