import { forwardRef, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { GoogleLogin } from '@react-oauth/google';
import { Eye, EyeOff, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Card } from '@/shared/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/cn';
import { Wordmark } from '@/shared/components/Wordmark';

const GOOGLE_LOGIN_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

type LoginValues = { username: string; password: string };
type SignupValues = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function LoginPage({
  initialTab = 'signin',
}: {
  initialTab?: 'signin' | 'signup';
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, loginWithGoogle, signup, user, loading } = useAuth();
  const [tab, setTab] = useState<'signin' | 'signup'>(initialTab);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Honor ?next=/dashboard so a guarded route can deep-link to a specific
  // app and resume after sign-in. Whitelist to relative paths to keep this
  // from being weaponised into an open-redirect.
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;
  const postLoginPath = next || '/dashboard';

  const loginForm = useForm<LoginValues>();
  const signupForm = useForm<SignupValues>();

  useEffect(() => setTab(initialTab), [initialTab]);

  useEffect(() => {
    if (!loading && user) {
      navigate(user.role === 'trial' ? '/pricing' : postLoginPath, { replace: true });
    }
  }, [loading, user, navigate, postLoginPath]);

  const onLogin = async (data: LoginValues) => {
    setBusy(true);
    try {
      const session = await login(data);
      toast.success('Welcome back');
      navigate(session?.user?.role === 'trial' ? '/trial' : postLoginPath, { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Login failed');
      loginForm.setError('root', { message: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const onSignup = async (data: SignupValues) => {
    setBusy(true);
    try {
      await signup({
        username: data.username,
        email: data.email,
        password: data.password,
      });
      const session = await login({
        username: data.username,
        password: data.password,
      });
      toast.success('Account created. Pick a plan to continue.');
      navigate('/pricing', {
        replace: true,
        state: { fromSignup: true, user: session?.user },
      });
    } catch (err: any) {
      toast.error(err?.message || 'Signup failed');
      signupForm.setError('root', { message: err?.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-foreground-muted">Preparing your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-[1280px] grid-cols-1 lg:grid-cols-2">
        {/* Left hero */}
        <motion.aside
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative hidden lg:flex flex-col justify-between p-12 bg-surface-muted/40"
        >
          <Wordmark size="md" animate />


          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent-pressed">
              <span className="size-1.5 rounded-full bg-accent" />
              Production console
            </span>
            <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-foreground">
              Operate your growth engine
              <br />
              from one workspace.
            </h1>
            <p className="max-w-md text-[15px] text-foreground-muted leading-relaxed">
              Research, local SEO, SERP intelligence, schema automation and content
              generation — every tool ships with credit-metered access and a clear audit
              trail.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 max-w-md">
              <Stat label="Uptime" value="99.98%" />
              <Stat label="Avg onboarding" value="4.7m" />
            </div>
          </div>

          <div className="flex flex-col gap-2 text-xs text-foreground-subtle">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5" />
              <span>JWT auth · bcrypt · per-route rate limits</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="size-3.5" />
              <span>Trial accounts reserve a workspace until verified</span>
            </div>
          </div>
        </motion.aside>

        {/* Right panel */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="flex items-center justify-center p-6 sm:p-12"
        >
          <Card className="w-full max-w-md shadow-elevation-md p-1">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <div className="p-5 pb-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="signin" className="mt-0">
                <form
                  onSubmit={loginForm.handleSubmit(onLogin)}
                  className="flex flex-col gap-4 p-6 pt-3"
                >
                  <FormField
                    id="username"
                    label="Username"
                    placeholder="e.g. operator.sarah"
                    error={loginForm.formState.errors.username?.message}
                    {...loginForm.register('username', {
                      required: 'Username is required',
                    })}
                  />
                  <FormField
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    label="Password"
                    placeholder="Enter your password"
                    error={loginForm.formState.errors.password?.message}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        className="text-foreground-subtle hover:text-foreground transition-colors"
                        tabIndex={-1}
                        aria-label={showPwd ? 'Hide password' : 'Show password'}
                      >
                        {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    }
                    {...loginForm.register('password', {
                      required: 'Password is required',
                    })}
                  />

                  {loginForm.formState.errors.root && (
                    <p className="rounded-md border border-rose bg-rose/30 px-3 py-2 text-xs text-rose-ink">
                      {loginForm.formState.errors.root.message}
                    </p>
                  )}

                  <Button type="submit" disabled={busy} size="lg" className="mt-2">
                    {busy ? 'Signing in…' : 'Access console'}
                    <ArrowRight className="size-4" />
                  </Button>

                  {GOOGLE_LOGIN_ENABLED && (
                    <>
                      <div className="relative my-2 flex items-center">
                        <div className="flex-1 border-t border-border" />
                        <span className="mx-3 text-[11px] uppercase tracking-wider text-foreground-subtle">
                          or
                        </span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                      <div className="flex justify-center">
                        <GoogleLogin
                          onSuccess={async (resp) => {
                            try {
                              const session = await loginWithGoogle(resp.credential || '');
                              toast.success('Welcome back');
                              navigate(
                                session?.user?.role === 'trial' ? '/trial' : postLoginPath,
                                { replace: true }
                              );
                            } catch (err: any) {
                              toast.error(err?.message || 'Google sign-in failed');
                            }
                          }}
                          onError={() => toast.error('Google sign-in was cancelled')}
                          width="100%"
                          theme="outline"
                          text="signin_with"
                        />
                      </div>
                    </>
                  )}
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form
                  onSubmit={signupForm.handleSubmit(onSignup)}
                  className="flex flex-col gap-4 p-6 pt-3"
                >
                  <div className="rounded-lg bg-sky/40 border border-sky px-3 py-2 text-xs text-sky-ink">
                    New accounts start as Trial seats. Sign up to reserve your username — pick
                    a plan after.
                  </div>

                  <FormField
                    id="signup-username"
                    label="Username"
                    placeholder="Pick a handle"
                    error={signupForm.formState.errors.username?.message}
                    {...signupForm.register('username', {
                      required: 'Username is required',
                      minLength: { value: 3, message: 'At least 3 characters' },
                      pattern: {
                        value: /^[a-zA-Z0-9_]+$/,
                        message: 'Letters, numbers, underscores only',
                      },
                    })}
                  />
                  <FormField
                    id="signup-email"
                    label="Email"
                    type="email"
                    placeholder="name@company.com"
                    error={signupForm.formState.errors.email?.message}
                    {...signupForm.register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Enter a valid email',
                      },
                    })}
                  />
                  <FormField
                    id="signup-password"
                    label="Password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Create a password"
                    error={signupForm.formState.errors.password?.message}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        className="text-foreground-subtle hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    }
                    {...signupForm.register('password', {
                      required: 'Password is required',
                      minLength: { value: 8, message: 'At least 8 characters' },
                    })}
                  />
                  <FormField
                    id="signup-confirm"
                    label="Confirm password"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter password"
                    error={signupForm.formState.errors.confirmPassword?.message}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="text-foreground-subtle hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showConfirm ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    }
                    {...signupForm.register('confirmPassword', {
                      required: 'Confirm your password',
                      validate: (v) =>
                        v === signupForm.watch('password') || 'Passwords do not match',
                    })}
                  />

                  {signupForm.formState.errors.root && (
                    <p className="rounded-md border border-rose bg-rose/30 px-3 py-2 text-xs text-rose-ink">
                      {signupForm.formState.errors.root.message}
                    </p>
                  )}

                  <Button type="submit" disabled={busy} size="lg" className="mt-2">
                    {busy ? 'Creating account…' : 'Create trial account'}
                    <ArrowRight className="size-4" />
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </Card>
        </motion.section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-foreground-subtle mt-1">
        {label}
      </div>
    </div>
  );
}

type FormFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  trailing?: React.ReactNode;
};

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ id, label, error, trailing, ...input }, ref) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          ref={ref}
          aria-invalid={!!error}
          className={cn(trailing && 'pr-9')}
          {...input}
        />
        {trailing && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex">{trailing}</div>
        )}
      </div>
      {error && (
        <span className="text-xs text-rose-ink" role="alert">
          {error}
        </span>
      )}
    </div>
  )
);
FormField.displayName = 'FormField';
