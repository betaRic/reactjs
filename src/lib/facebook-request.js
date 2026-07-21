import "server-only";

import { getFacebookOAuthReadiness, getSelectedOAuthFacebookConfig } from "@/lib/facebook-connections";
import { FacebookApiError } from "@/lib/facebook-server";

export async function resolveFacebookConfig(request, { allowMissing = false, pageId = "" } = {}) {
  const oauthReadiness = getFacebookOAuthReadiness();
  if (!oauthReadiness.available) {
    if (allowMissing) return { configured: false, missing: oauthReadiness.missing, mode: "unconfigured", oauthAvailable: false, connectionRequired: false };
    throw new FacebookApiError("Facebook account access is not configured on this deployment.", 503, { missing: oauthReadiness.missing });
  }

  const oauthConfig = await getSelectedOAuthFacebookConfig(request, pageId);
  if (oauthConfig) return { ...oauthConfig, oauthAvailable: true, connectionRequired: false };
  if (allowMissing) {
    return { configured: false, missing: [], mode: "account", oauthAvailable: true, connectionRequired: true };
  }
  throw new FacebookApiError("Sign in with Facebook and choose a Page before publishing.", 401);
}

export async function authorizeMediaUpload(request, pageId) {
  return resolveFacebookConfig(request, { pageId });
}
