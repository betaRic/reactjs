import { describe, expect, it } from "vitest";
import { canManageOfficeTemplates, canWriteCampaign } from "./workspace-policy";

describe("office workspace authorization", () => {
  it.each(["office_admin", "publisher", "editor"])("allows %s to edit campaigns", (role) => {
    expect(canWriteCampaign(role)).toBe(true);
  });

  it("keeps viewers read-only", () => {
    expect(canWriteCampaign("viewer")).toBe(false);
    expect(canManageOfficeTemplates("viewer")).toBe(false);
  });

  it("limits reusable template changes to office administrators", () => {
    expect(canManageOfficeTemplates("office_admin")).toBe(true);
    expect(canManageOfficeTemplates("publisher")).toBe(false);
    expect(canManageOfficeTemplates("editor")).toBe(false);
  });
});
