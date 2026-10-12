// Read-only, redacted scan of the branch history that would be disclosed.
// Heuristic checks complement, but do not replace, professional secret scanning.
import { execFileSync } from "node:child_process";

// Local recovery refs can contain unrelated user work. They are not pushed by
// normal branch publication and must not be exported or included in this package.
const refs = ["HEAD", "refs/remotes/origin/main"];
const objects = execFileSync("git", ["rev-list", "--objects", ...refs], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
const patterns = [
  ["private-key PEM", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub credential", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,})\b/],
  ["service API credential", /\b(?:sb_secret_[A-Za-z0-9_-]{20,}|sk-(?:proj-|live-)?[A-Za-z0-9_-]{30,})\b/],
  ["AWS access ID", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["JWT candidate", /\beyJ[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{25,}\b/],
];
const seen = new Set();
const findings = [];
const skipped = [];
let count = 0;
for (const line of objects.trim().split("\n")) {
  const space = line.indexOf(" ");
  if (space < 0) continue;
  const oid = line.slice(0, space);
  const path = line.slice(space + 1);
  if (seen.has(oid)) continue;
  seen.add(oid);
  const type = execFileSync("git", ["cat-file", "-t", oid], { encoding: "utf8" }).trim();
  if (type !== "blob") continue;
  count++;
  if (/(?:^|\/)\.env(?:\.(?:local|production|development|test)(?:\.local)?)?$/.test(path)) findings.push({ oid: oid.slice(0, 12), path, kind: "tracked environment file" });
  const size = Number(execFileSync("git", ["cat-file", "-s", oid], { encoding: "utf8" }).trim());
  if (size > 5 * 1024 * 1024 || /\.(?:zip|mp4|mov|png|jpe?g|gif|webp|pdf|aiff?|wav|mp3)$/i.test(path)) {
    skipped.push({ oid: oid.slice(0, 12), path, size, reason: "binary/media or oversized blob needs separate disclosure review" });
    continue;
  }
  const bytes = execFileSync("git", ["cat-file", "blob", oid], { maxBuffer: 6 * 1024 * 1024 });
  if (bytes.includes(0)) { skipped.push({ oid: oid.slice(0, 12), path, size, reason: "binary blob" }); continue; }
  const content = bytes.toString("utf8");
  for (const [kind, pattern] of patterns) {
    if (pattern.test(content)) findings.push({ oid: oid.slice(0, 12), path, kind });
  }
}
console.log(JSON.stringify({ refs, reachableBlobsChecked: count, findings, skipped, limitation: "Heuristic redacted scan; absence of matches does not guarantee absence of secrets or safe disclosure. Review skipped assets separately." }, null, 2));
if (findings.length) process.exitCode = 1;
