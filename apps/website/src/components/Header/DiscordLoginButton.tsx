import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, useSignIn, useSignOut } from '../../hooks/useSession.js';

const useDropdown = () => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = useCallback(() => {
    setShowDropdown((prev) => !prev);
  }, []);

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDropdown, closeDropdown]);

  return { showDropdown, dropdownRef, toggleDropdown, closeDropdown };
};

// Clean up OAuth parameters from URL on load
// This is a side-effect that can run once on module load in a client component.
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  if (
    urlParams.has('code') ||
    urlParams.has('state') ||
    urlParams.has('error')
  ) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

export const DiscordLoginButton: React.FC = () => {
  const { showDropdown, dropdownRef, toggleDropdown, closeDropdown } =
    useDropdown();

  const { data: session, isPending } = useSession();
  const { mutate: signIn, isPending: isSigningIn } = useSignIn();
  const { mutate: signOut, isPending: isSigningOut } = useSignOut();

  const handleSignOut = () => {
    closeDropdown();
    signOut();
  };

  const isLoading = isSigningIn || isSigningOut;

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
              {isSigningOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn()}
      disabled={isSigningIn}
      className="nav-cta discord-login"
    >
      {isSigningIn ? 'Signing in...' : 'Login with Discord'}
    </button>
  );
};
