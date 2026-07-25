import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/shared/ui/command';
import { ALL_TOOLS, PRIMARY_TABS } from '@/app/nav-config';
import { Settings, Shield, CreditCard, LogOut, Sun, Moon } from 'lucide-react';
// nothing else to alias
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { setTheme } = useTheme();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tools, pages, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon!;
            return (
              <CommandItem
                key={tab.id}
                value={`${tab.label} ${tab.id}`}
                onSelect={() => go(tab.path)}
              >
                <Icon />
                {tab.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tools">
          {ALL_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <CommandItem
                key={tool.id}
                value={`${tool.label} ${tool.section} ${(tool.keywords ?? []).join(' ')}`}
                onSelect={() => go(tool.path)}
              >
                <Icon />
                <span>{tool.label}</span>
                <CommandShortcut>{tool.section}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem onSelect={() => go('/settings')}>
            <Settings />
            Settings
          </CommandItem>
          <CommandItem onSelect={() => go('/pricing')}>
            <CreditCard />
            Billing & plans
          </CommandItem>
          {user?.role === 'admin' && (
            <CommandItem onSelect={() => go('/admin')}>
              <Shield />
              Admin panel
            </CommandItem>
          )}
          <CommandItem
            onSelect={async () => {
              onOpenChange(false);
              await logout();
              navigate('/signin');
            }}
          >
            <LogOut />
            Log out
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => setTheme('light')}>
            <Sun /> Switch to light
          </CommandItem>
          <CommandItem onSelect={() => setTheme('dark')}>
            <Moon /> Switch to dark
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}
