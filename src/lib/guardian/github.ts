/**
 * Guardian GitHub integration — open / dedupe issues from triaged Sentry
 * events.
 *
 * Auth: requires `GITHUB_TOKEN` (PAT with `repo:public_repo` for public
 * repo, `repo` for private). Repo: `GUARDIAN_GITHUB_REPO=owner/name`.
 *
 * Dedup strategy:
 *   - Every Guardian-created issue gets the label `guardian` plus a
 *     fingerprint label `guardian-fp:<sha1-12>` derived from the Sentry
 *     issue id (or title fallback). Before opening, we GET issues filtered
 *     by both labels — if one exists OPEN, we comment on it instead.
 *
 * All helpers fail-open: any GitHub API error returns null, the caller
 * still persists the GuardianEvent row and notifies the admin.
 */

import { createHash } from 'crypto';

const GITHUB_API = 'https://api.github.com';

export interface GitHubIssueRef {
  url: string;
  number: number;
  reused: boolean;
}

export interface OpenIssueInput {
  fingerprintSeed: string; // stable per Sentry issue (issueId || title)
  title: string;
  body: string;
}

function isConfigured(): { token: string; repo: string } | null {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GUARDIAN_GITHUB_REPO;
  if (!token || !repo || !repo.includes('/')) return null;
  return { token, repo };
}

function fingerprintLabel(seed: string): string {
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 12);
  return `guardian-fp:${hash}`;
}

async function gh(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DogUniverse-Guardian/1.0',
      ...(init.headers ?? {}),
    },
  });
}

async function findOpenIssueByLabels(
  repo: string,
  labels: string[],
  token: string,
): Promise<GitHubIssueRef | null> {
  const labelParam = encodeURIComponent(labels.join(','));
  const res = await gh(
    `/repos/${repo}/issues?state=open&labels=${labelParam}&per_page=1`,
    { method: 'GET' },
    token,
  );
  if (!res.ok) return null;
  const list = (await res.json()) as Array<{ number: number; html_url: string }>;
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  return { url: first.html_url, number: first.number, reused: true };
}

async function commentOnIssue(
  repo: string,
  number: number,
  body: string,
  token: string,
): Promise<void> {
  await gh(
    `/repos/${repo}/issues/${number}/comments`,
    { method: 'POST', body: JSON.stringify({ body }) },
    token,
  );
}

/**
 * Open a deduplicated GitHub issue, or comment on the existing one.
 * Returns null if GitHub is not configured or the API call fails.
 */
export async function openOrReuseIssue(input: OpenIssueInput): Promise<GitHubIssueRef | null> {
  const cfg = isConfigured();
  if (!cfg) return null;
  const { token, repo } = cfg;
  const fp = fingerprintLabel(input.fingerprintSeed);
  const labels = ['guardian', fp];

  try {
    const existing = await findOpenIssueByLabels(repo, labels, token);
    if (existing) {
      await commentOnIssue(repo, existing.number, `Recurrence detected.\n\n${input.body}`, token);
      return existing;
    }
    const res = await gh(
      `/repos/${repo}/issues`,
      {
        method: 'POST',
        body: JSON.stringify({ title: input.title, body: input.body, labels }),
      },
      token,
    );
    if (!res.ok) {
      // 422 commonly means a label doesn't exist — try once without the
      // fingerprint label (just `guardian`) so the user gets the issue
      // even on a fresh repo. Fingerprint dedup will kick in on retry once
      // labels exist.
      if (res.status === 422) {
        const fallback = await gh(
          `/repos/${repo}/issues`,
          {
            method: 'POST',
            body: JSON.stringify({ title: input.title, body: input.body, labels: ['guardian'] }),
          },
          token,
        );
        if (!fallback.ok) return null;
        const fb = (await fallback.json()) as { number: number; html_url: string };
        return { url: fb.html_url, number: fb.number, reused: false };
      }
      return null;
    }
    const created = (await res.json()) as { number: number; html_url: string };
    return { url: created.html_url, number: created.number, reused: false };
  } catch {
    return null;
  }
}

export const __internals = { fingerprintLabel };
