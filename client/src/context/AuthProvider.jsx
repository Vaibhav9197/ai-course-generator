import { Auth0Provider } from '@auth0/auth0-react';
import {
  auth0Audience,
  auth0ClientId,
  auth0Domain,
  isAuthEnabled,
} from '../utils/authConfig.js';

/**
 * Wraps the app in Auth0.
 *
 * Two settings here are the difference between working and mysteriously broken:
 *
 *  - `authorizationParams.audience` must be set, and must match AUTH0_AUDIENCE on the
 *    server. Without it Auth0 issues an opaque access token instead of a JWT, and every
 *    API call fails with 401 while login itself appears to succeed.
 *
 *  - `useRefreshTokens` with `cacheLocation: 'localstorage'` keeps sessions alive in
 *    browsers that block third-party cookies (Safari, Brave, Firefox ETP). Silent renewal
 *    via hidden iframe fails there, so a page refresh would otherwise log the user out.
 *
 * When Auth0 is not configured this renders children unchanged, and the app runs in the
 * unauthenticated development mode described in utils/authConfig.js.
 */
export function AuthProvider({ children }) {
  if (!isAuthEnabled) return children;

  return (
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/callback`,
        audience: auth0Audience,
      }}
      useRefreshTokens
      cacheLocation="localstorage"
      // Send the user back to where they were before login, not always to the home page.
      onRedirectCallback={(appState) => {
        const target = appState?.returnTo || '/';
        window.history.replaceState({}, document.title, target);
      }}
    >
      {children}
    </Auth0Provider>
  );
}

export default AuthProvider;
