import { describe, expect, it } from "vitest";
import { canAccessContractArea, resolveContractAreaScope, scopedContractAreaId } from "./scope";

describe("resolveContractAreaScope", () => {
  it("does not restrict roles outside the scoped set", () => {
    for (const role of ["ADMIN", "CITY_MANAGER", "DEPT_MANAGER", "INSPECTOR", "EMPLOYEE", "VIEWER", "FINANCE"]) {
      expect(resolveContractAreaScope({ role })).toEqual({ restricted: false });
    }
  });

  it("restricts CONTRACTOR_MANAGER and SITE_SUPERVISOR to their assigned contract area", () => {
    expect(resolveContractAreaScope({ role: "CONTRACTOR_MANAGER", contractAreaId: "ca-1" })).toEqual({
      restricted: true,
      contractAreaId: "ca-1",
    });
    expect(resolveContractAreaScope({ role: "SITE_SUPERVISOR", contractAreaId: null })).toEqual({
      restricted: true,
      contractAreaId: null,
    });
  });
});

describe("scopedContractAreaId", () => {
  it("passes through an unrestricted role's requested filter unchanged", () => {
    expect(scopedContractAreaId({ role: "ADMIN" }, "ca-2")).toBe("ca-2");
    expect(scopedContractAreaId({ role: "ADMIN" })).toBeUndefined();
  });

  it("returns NONE for a scoped role with no contract area assigned yet — never everything", () => {
    expect(scopedContractAreaId({ role: "CONTRACTOR_MANAGER", contractAreaId: null })).toBe("NONE");
  });

  it("returns NONE when a scoped role asks for a different contract area than its own", () => {
    expect(scopedContractAreaId({ role: "CONTRACTOR_MANAGER", contractAreaId: "ca-1" }, "ca-2")).toBe("NONE");
  });

  it("returns the caller's own contract area when it matches or nothing was requested", () => {
    expect(scopedContractAreaId({ role: "CONTRACTOR_MANAGER", contractAreaId: "ca-1" })).toBe("ca-1");
    expect(scopedContractAreaId({ role: "CONTRACTOR_MANAGER", contractAreaId: "ca-1" }, "ca-1")).toBe("ca-1");
  });
});

describe("canAccessContractArea", () => {
  it("always allows an unrestricted role", () => {
    expect(canAccessContractArea({ role: "ADMIN" }, "ca-1")).toBe(true);
    expect(canAccessContractArea({ role: "ADMIN" }, null)).toBe(true);
  });

  it("allows a scoped role to see a record with no contract area attributed yet", () => {
    expect(canAccessContractArea({ role: "CONTRACTOR_MANAGER", contractAreaId: "ca-1" }, null)).toBe(true);
  });

  it("blocks a scoped role from a record belonging to a different contract area", () => {
    expect(canAccessContractArea({ role: "CONTRACTOR_MANAGER", contractAreaId: "ca-1" }, "ca-2")).toBe(false);
  });

  it("allows a scoped role to see its own contract area's record", () => {
    expect(canAccessContractArea({ role: "SITE_SUPERVISOR", contractAreaId: "ca-1" }, "ca-1")).toBe(true);
  });

  it("blocks an unassigned scoped role from every attributed record", () => {
    expect(canAccessContractArea({ role: "CONTRACTOR_MANAGER", contractAreaId: null }, "ca-1")).toBe(false);
  });
});
