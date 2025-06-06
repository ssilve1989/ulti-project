import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth.js';

export const useSession = () => {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => authClient.getSession(),
    staleTime: 60 * 1000,
  });
};

export const useSignIn = () => {
  return useMutation({
    mutationFn: () =>
      authClient.signIn.social({
        provider: 'discord',
        callbackURL: window.location.origin,
      }),
    onError: (error) => {
      console.error('Sign in error:', error);
    },
  });
};

export const useSignOut = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (error) => {
      console.error('Sign out error:', error);
    },
  });
};
