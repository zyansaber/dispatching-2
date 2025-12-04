import { createContext, useContext, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeftRight, Banknote, BarChart3, ChevronLeft, ChevronRight, Home, Menu, Truck, Warehouse } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';

type DashboardContextValue = {
  dealer: string;
  setDealer: (dealer: string) => void;
  collapsed: boolean;
  toggleSidebar: () => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboardContext must be used within AppLayout');
  }
  return context;
}

const navItems = [
  { label: 'Dashboard', icon: Home, href: '/dashboard' },
  { label: 'Inventory', icon: Warehouse, href: '/inventory' },
  { label: 'Yard', icon: Truck, href: '/yard' },
  { label: 'Finance', icon: Banknote, href: '/finance' },
  { label: 'Reports', icon: BarChart3, href: '/reports' },
];

const stats = [
  { label: 'Loads active', value: '132', tone: 'text-blue-600' },
  { label: 'Releases today', value: '48', tone: 'text-emerald-600' },
  { label: 'Holds', value: '12', tone: 'text-amber-600' },
];

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  dealer: string;
  onDealerChange: (dealer: string) => void;
};

function Sidebar({ collapsed, onToggle, dealer, onDealerChange }: SidebarProps) {
  const location = useLocation();

  const activePath = useMemo(() => {
    if (location.pathname === '/') return '/dashboard';
    return location.pathname;
  }, [location.pathname]);

  return (
    <aside
      className={cn(
        'relative flex h-screen flex-col border-r bg-gradient-to-b from-white via-slate-50 to-slate-100/60 transition-all duration-200',
        collapsed ? 'w-[76px]' : 'w-[280px]',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-4">
        <div className={cn('space-y-0.5', collapsed && 'hidden')}>
          <p className="text-sm font-semibold tracking-tight">Dispatch Ops</p>
          <p className="text-xs text-muted-foreground">Custom layout · Tailwind</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggle} className="shrink-0">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 space-y-4 px-3 py-4">
        <Card className="border-dashed bg-white/70">
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">Dealer</p>
              <Badge variant="secondary" className="rounded-full px-2">Live</Badge>
            </div>
            <Select value={dealer} onValueChange={onDealerChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose dealer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cascade Auto Group">Cascade Auto Group</SelectItem>
                <SelectItem value="Blue River Trucks">Blue River Trucks</SelectItem>
                <SelectItem value="Prairie Logistics">Prairie Logistics</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = activePath.startsWith(item.href);
            const content = (
              <Button
                variant={active ? 'secondary' : 'ghost'}
                className={cn('w-full justify-start gap-2 text-sm', collapsed && 'px-2')}
                asChild
              >
                <Link to={item.href}>
                  <item.icon className="h-4 w-4" />
                  {!collapsed && item.label}
                </Link>
              </Button>
            );

            if (collapsed) {
              return (
                <TooltipProvider key={item.href}>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }

            return <div key={item.href}>{content}</div>;
          })}
        </nav>

        <div className="grid gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border bg-white/70 px-3 py-2 text-sm">
              <p className="text-muted-foreground">{stat.label}</p>
              <p className={cn('text-lg font-semibold', stat.tone)}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t p-3">
        <Button variant="outline" className="w-full justify-start gap-2" asChild>
          <a href="https://dispatch.local/support" target="_blank" rel="noreferrer">
            <ArrowLeftRight className="h-4 w-4" />
            {!collapsed && 'Share feedback'}
          </a>
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2">
          <Menu className="h-4 w-4" />
          {!collapsed && 'Command menu'}
        </Button>
      </div>
    </aside>
  );
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [dealer, setDealer] = useState('Cascade Auto Group');

  const toggleSidebar = () => setCollapsed((prev) => !prev);

  return (
    <DashboardContext.Provider value={{ dealer, setDealer, collapsed, toggleSidebar }}>
      <div className="flex min-h-screen bg-slate-50 text-slate-900">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} dealer={dealer} onDealerChange={setDealer} />
        <main className="flex-1 overflow-auto">
          <div className="border-b bg-white/80 backdrop-blur">
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Command center</p>
                <p className="text-lg font-semibold text-slate-900">Operations</p>
              </div>
              <Badge variant="outline" className="rounded-full px-3">
                {collapsed ? 'Compact' : 'Expanded'}
              </Badge>
            </div>
          </div>
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </DashboardContext.Provider>
  );
}
