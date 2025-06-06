import React from 'react';
import { QueryProvider } from '../QueryProvider.js';
import { DiscordLoginButton } from './DiscordLoginButton.js';

export const AuthenticatedHeader: React.FC = () => {
  return (
    <QueryProvider>
      <DiscordLoginButton />
    </QueryProvider>
  );
};
