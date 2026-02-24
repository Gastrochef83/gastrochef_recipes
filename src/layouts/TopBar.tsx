import React from 'react';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Menu } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export const TopBar: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="border-b border-border h-16 flex items-center px-6">
      <Button variant="ghost" size="icon" className="md:hidden mr-2">
        <Menu className="h-5 w-5" />
      </Button>
      
      <div className="flex items-center justify-between w-full">
        <h1 className="text-xl font-bold">GastroChef v5</h1>
        
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
            <span className="sr-only">Toggle theme</span>
          </Button>
          
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
            U
          </div>
        </div>
      </div>
    </header>
  );
};