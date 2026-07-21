import "server-only";

import { getFacebookOAuthReadiness, getSelectedOAuthFacebookConfig } from "@/lib/facebook-connections";
import { FacebookApiError, getFacebookConfig, requirePublishAccess, verifyPublishKeyValue } from "@/lib/facebook-server";

export async function resolveFacebookConfig(request, { allowMissing = false } = {}) {
  const oauthConfig = await getSelectedOAuthFacebookConfig(request);
  if (oauthConfig) return { ...oauthConfig, oauthAvailable: true, connectionRequired: false };

  const legacy = getFacebookConfig({ allowMissing: true });
  const oauthReadiness = getFacebookOAuthReadiness();
  if (legacy.configured) {
    requirePublishAccess(request, legacy);
    return { ...legacy, mode: "legacy", oauthAvailable: oauthReadiness.available, connectionRequired: false };
  }
  if (allowMissing) {
    return { ...legacy, mode: "unconfigured", oauthAvailable: oauthReadiness.available, connectionRequired: oauthReadiness.available };
  }
  if (oauthReadiness.available) throw new FacebookApiError("Connect and select a Facebook Page before publishing.", 401);
  throw new FacebookApiError("Facebook publishing is not configured on this deployment.", 503, { missing: [...new Set([...legacy.missing, ...oauthReadiness.missing])] });
}

export async function authorizeMediaUpload(request, publishKey) {
  const oauthConfig = await getSelectedOAuthFacebookConfig(request);
  if (oauthConfig) return oauthConfig;
  const legacy = getFacebookConfig();
  verifyPublishKeyValue(publishKey, legacy);
  return { ...legacy, mode: "legacy" };
}
