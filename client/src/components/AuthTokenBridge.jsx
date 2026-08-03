import { useEffect } from 'react';
import { attachTokenProvider } from '../utils/api.js';
import { useAuth } from '../hooks/useAuth.js';

/**
 * Connects the Auth0 SDK to the axios instance.
 *
 * The bridge exists because `getAccessTokenSilently` only exists inside the Auth0 React
 * context, while the axios instance is a module singleton created at import time. Rather
 * than making every call site fetch a token, this registers a provider function once and
 * the request interceptor calls it per request.
 *
 * Renders nothing.
 */
export function AuthTokenBridge() {
  const { getToken, isAuthenticated, enabled } = useAuth();

  useEffect(() => {
    if (!enabled) return;
    attachTokenProvider(getToken);
    // getToken identity changes as the SDK initialises, so re-register when it does.
  }, [getToken, isAuthenticated, enabled]);

  return null;
}

export default AuthTokenBridge;
