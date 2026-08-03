import { useAuth0 } from '@auth0/auth0-react';
import { isAuthEnabled } from '../utils/authConfig.js';

/**
 * Single source of truth for auth state in the UI.
 *
 * Wrapping the Auth0 SDK serves two purposes:
 *
 *  1. It gives the app one uniform shape whether Auth0 is configured or not. Without a
 *     tenant, the app behaves as a signed-in local developer — matching the server's
 *     dev-identity fallback — so no component needs to branch on configuration.
 *
 *  2. Outside an Auth0Provider, the SDK's context methods throw when *called* (reading
 *     state is safe). Routing every call through here means that trap exists in one file
 *     rather than in every component with a login button.
 */
export function useAuth() {
  const auth0 = useAuth0();

  if (!isAuthEnabled) {
    return {
      enabled: false,
      isLoading: false,
      isAuthenticated: true,
      user: { name: 'Local developer', email: 'dev@localhost' },
      login: () => {},
      logout: () => {},
      getToken: async () => null,
      error: null,
    };
  }

  return {
    enabled: true,
    isLoading: auth0.isLoading,
    isAuthenticated: auth0.isAuthenticated,
    user: auth0.user,
    error: auth0.error,
    login: (returnTo) =>
      auth0.loginWithRedirect({
        appState: { returnTo: returnTo ?? window.location.pathname },
      }),
    logout: () => auth0.logout({ logoutParams: { returnTo: window.location.origin } }),
    getToken: auth0.getAccessTokenSilently,
  };
}

export default useAuth;
