import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  LogOut,
  Settings,
  Shield,
  CreditCard,
  User as UserIcon,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';

export function UserMenu() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  if (!user) return null;

  const initials = (user.username || 'U')
    .split(/[\s._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0].toUpperCase())
    .join('');

  const onLogout = async () => {
    await logout();
    navigate('/signin');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          aria-label="Open account menu"
        >
          <Avatar className="size-8 ring-2 ring-transparent hover:ring-border-strong transition-shadow">
            <AvatarFallback className="bg-accent-soft text-accent-pressed font-semibold">
              {initials || <UserIcon className="size-4" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {user.username}
            </span>
            <span className="text-[11px] text-foreground-subtle font-normal normal-case tracking-normal">
              {user.email || user.role}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/pricing')}>
          <CreditCard className="size-4" />
          Billing & plans
        </DropdownMenuItem>
        {user.role === 'admin' && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <Shield className="size-4" />
            Admin panel
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4" /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4" /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} className="text-rose-ink">
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
