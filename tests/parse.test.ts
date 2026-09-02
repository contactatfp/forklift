import { describe, expect, it } from "vitest";
import { parseCriteria, parseGithubRepo, sameRepo } from "@/lib/github/parse";

describe("parseGithubRepo", () => {
  it("accepts full URLs, .git suffixes, trailing slashes, and owner/name", () => {
    for (const input of [
      "https://github.com/solari-sdk/solari-cookbook",
      "https://github.com/solari-sdk/solari-cookbook.git",
      "https://github.com/solari-sdk/solari-cookbook/",
      "solari-sdk/solari-cookbook",
    ]) {
      const repo = parseGithubRepo(input);
      expect(repo.owner).toBe("solari-sdk");
      expect(repo.name).toBe("solari-cookbook");
      expect(repo.cloneUrl).toBe("https://github.com/solari-sdk/solari-cookbook.git");
    }
  });

  it("rejects things that are not a GitHub repo", () => {
    expect(() => parseGithubRepo("https://gitlab.com/a/b")).toThrow();
    expect(() => parseGithubRepo("not a url")).toThrow();
  });

  it("compares repos case-insensitively", () => {
    expect(sameRepo(parseGithubRepo("A/B"), parseGithubRepo("a/b"))).toBe(true);
  });
});

describe("parseCriteria", () => {
  it("strips bullets and blank lines", () => {
    expect(parseCriteria("- one\n\n* two\nthree  \n")).toEqual(["one", "two", "three"]);
  });
});
