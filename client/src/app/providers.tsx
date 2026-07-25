import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { Toaster } from '@/shared/ui/sonner';
import { MotionProvider } from '@/shared/motion/MotionProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import ErrorBoundary from '@/shared/components/ErrorBoundary';

type Props = { children: React.ReactNode };

export function Providers({ children }: Props) {
  return (
    <ErrorBoundary>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
        storageKey="theme"
      >
        <MotionProvider>
          <TooltipProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </TooltipProvider>
        </MotionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
