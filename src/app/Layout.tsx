import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, ChefHat, BookOpen, ShoppingCart, Settings, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ModeToggle } from '@/components/mode-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/stores/auth-store';
import { cn } from '@/lib/utils';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();

  const navItems = [
    { icon: ChefHat, label: 'Recipes', href: '/recipes' },
    { icon: BookOpen, label: 'Dashboard', href: '/dashboard' },
    { icon: ShoppingCart, label: 'Ingredients', href: '/ingredients' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="fixed top-4 left-4 z-50 md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <SidebarContent navItems={navItems} onClose={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 flex-col border-r bg-muted/40 p-4">
        <SidebarContent navItems={navItems} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b bg-muted/40 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">GastroChef V5</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar_url || ''} alt={user?.email || 'User'} />
                <AvatarFallback>{user?.email?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="hidden md:inline-block">{user?.email}</span>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

interface SidebarContentProps {
  navItems: Array<{ icon: React.ElementType; label: string; href: string }>;
  onClose?: () => void;
}

function SidebarContent({ navItems, onClose }: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-8 mt-4 flex items-center gap-2 px-2">
        <ChefHat className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold">GastroChef V5</span>
      </div>
      
      <nav className="flex-1">
        <ul className="space-y-1">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={index}>
                <a
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                    window.location.pathname === item.href ? 'bg-accent' : 'text-muted-foreground'
                  )}
                  onClick={() => onClose && onClose()}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      
      <div className="mt-auto pt-4 border-t">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium">
          <User className="h-4 w-4" />
          <span>Restaurant: {localStorage.getItem('restaurantName') || 'Demo'}</span>
        </div>
      </div>
    </div>
  );
}