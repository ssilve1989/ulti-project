import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authClient } from '../lib/auth.js';

export const DiscordLoginButton: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [isPending, setIsPending] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshSession = useCallback(async () => {
    try {
      const sessionData = await authClient.getSession();
      setSession(sessionData);
    } catch (error) {
      console.error('Error getting session:', error);
    } finally {
      setIsPending(false);
    }
  }, []);

  // Check if we're returning from OAuth
  const isOAuthReturn = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return (
      urlParams.has('code') || urlParams.has('state') || urlParams.has('error')
    );
  }, []);

  // Clean up OAuth parameters from URL
  const cleanupOAuthUrl = useCallback(() => {
    if (isOAuthReturn()) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [isOAuthReturn]);

  // Initial session load
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Handle OAuth return
  useEffect(() => {
    if (isOAuthReturn()) {
      cleanupOAuthUrl();
      // Refresh session after OAuth callback
      const timeoutId = setTimeout(refreshSession, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [isOAuthReturn, cleanupOAuthUrl, refreshSession]);

  // Handle window focus (user returning to tab)
  useEffect(() => {
    const handleFocus = () => refreshSession();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshSession]);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

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
    setShowDropdown(false);
    try {
      await authClient.signOut();
      setSession(null);
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };

  if (isPending) {
    return <div className="nav-cta loading">Loading...</div>;
  }

  if (session?.data?.user) {
    return (
      <div className="user-menu" ref={dropdownRef}>
        <button
          type="button"
          onClick={toggleDropdown}
          className="user-avatar-button"
          disabled={isLoading}
        >
          {session.data.user.image && (
            <img
              src={session.data.user.image}
              alt={session.data.user.name || 'User'}
              className="user-avatar"
            />
          )}
          <span className="user-name">{session.data.user.name}</span>
          <span className="dropdown-arrow">▼</span>
        </button>

        {showDropdown && (
          <div className="user-dropdown">
            <div className="dropdown-item user-info-item">
              <div className="discord-tag">@{session.data.user.name}</div>
            </div>
            <div className="dropdown-divider" />
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isLoading}
              className="dropdown-item dropdown-button"
            >
              {isLoading ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        )}
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
