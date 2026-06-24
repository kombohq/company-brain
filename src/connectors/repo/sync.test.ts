import { describe, expect, test } from "bun:test";
import { remoteUrl, repoName } from "./sync.js";

describe("repoName", () => {
  test("takes the last path segment of owner/name", () => {
    expect(repoName("kombohq/company-brain")).toBe("company-brain");
  });

  test("strips a trailing .git and slashes", () => {
    const fromGit = repoName("https://github.com/kombohq/company-brain.git");
    const fromSlash = repoName("https://github.com/kombohq/company-brain/");
    expect(fromGit).toBe("company-brain");
    expect(fromSlash).toBe("company-brain");
  });

  test("throws when no name can be derived", () => {
    expect(() => repoName("/")).toThrow(/Could not derive/);
  });
});

describe("remoteUrl", () => {
  test("expands owner/name into a github clone URL", () => {
    const url = remoteUrl("kombohq/company-brain");
    expect(url).toBe("https://github.com/kombohq/company-brain.git");
  });

  test("expands owner/name with a trailing .git without doubling it", () => {
    const url = remoteUrl("kombohq/company-brain.git");
    expect(url).toBe("https://github.com/kombohq/company-brain.git");
  });

  test("leaves a full clone URL untouched", () => {
    const ssh = "git@github.com:kombohq/company-brain.git";
    const https = "https://example.com/team/repo.git";
    expect(remoteUrl(ssh)).toBe(ssh);
    expect(remoteUrl(https)).toBe(https);
  });
});
