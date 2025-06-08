import React, { useState, useEffect } from 'react';
import { authClient } from '../lib/auth.js';

export const DiscordLoginButton: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [isPending, setIsPending] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        const sessionData = await authClient.getSession();
        setSession(sessionData);
      } catch (error) {
        console.error('Error getting session:', error);
      } finally {
        setIsPending(false);
      }
    };

    getSession();

    // Listen for URL changes (after OAuth callback)
    const handleURLChange = () => {
      if (
        window.location.search.includes('code=') ||
        window.location.search.includes('state=')
      ) {
        // Refresh session after OAuth callback
        setTimeout(() => {
          getSession();
        }, 1000);
      }
    };

    handleURLChange();
  }, []);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: 'discord',
        callbackURL: window.location.origin,
      });
    } catch (error) {
      console.error('Sign in error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await authClient.signOut();
      setSession(null);
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isPending) {
    return <div className="nav-cta loading">Loading...</div>;
  }

  if (session?.user) {
    return (
      <div className="user-menu">
        <div className="user-info">
          {session.user.image && (
            <img
              src={session.user.image}
              alt={session.user.name || 'User'}
              className="user-avatar"
            />
          )}
          <span className="user-name">{session.user.name}</span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isLoading}
          className="sign-out-button"
        >
          {isLoading ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading}
      className="nav-cta discord-login"
    >
      {isLoading ? 'Signing in...' : 'Login with Discord'}
    </button>
  );
};
