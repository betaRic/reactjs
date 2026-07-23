const CAMPAIGN_WRITE_ROLES = new Set(["office_admin", "publisher", "editor"]);
const TEMPLATE_WRITE_ROLES = new Set(["office_admin"]);

export function canWriteCampaign(role) {
  return CAMPAIGN_WRITE_ROLES.has(String(role || ""));
}

export function canManageOfficeTemplates(role) {
  return TEMPLATE_WRITE_ROLES.has(String(role || ""));
}
