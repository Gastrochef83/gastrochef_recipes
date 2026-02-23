// pages/Login.tsx - Premium first impression
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { signIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="login-container" data-theme={theme}>
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.svg" alt="GastroChef" className="logo" />
          <h1>GastroChef</h1>
          <p>Professional Kitchen Management</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          <Button
            type="submit"
            disabled={loading}
            fullWidth
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
        
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
      
      <style>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface-secondary);
          padding: 1rem;
        }
        
        .login-card {
          max-width: 400px;
          width: 100%;
          background: var(--surface);
          border-radius: 16px;
          padding: 2rem;
          box-shadow: var(--shadow-lg);
          position: relative;
        }
        
        .login-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .logo {
          width: 80px;
          height: 80px;
          margin-bottom: 1rem;
        }
        
        .login-header h1 {
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 0.5rem 0;
        }
        
        .login-header p {
          color: var(--text-secondary);
          margin: 0;
        }
        
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .error-message {
          background: var(--danger);
          color: white;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.875rem;
          text-align: center;
        }
        
        .theme-toggle {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: var(--surface-secondary);
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.25rem;
          color: var(--text-primary);
          transition: all 0.2s;
        }
        
        .theme-toggle:hover {
          background: var(--surface-tertiary);
        }
      `}</style>
    </div>
  );
}