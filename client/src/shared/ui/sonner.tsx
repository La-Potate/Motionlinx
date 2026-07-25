import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="top-right"
      richColors={false}
      closeButton
      offset={16}
      gap={8}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-elevation-md group-[.toaster]:rounded-lg',
          description: 'group-[.toast]:text-foreground-muted',
          actionButton:
            'group-[.toast]:bg-accent group-[.toast]:text-accent-foreground',
          cancelButton:
            'group-[.toast]:bg-surface-muted group-[.toast]:text-foreground',
          success: '!border-mint',
          error: '!border-rose',
          info: '!border-sky',
          warning: '!border-butter',
        },
      }}
    />
  );
}

export { toast } from 'sonner';
