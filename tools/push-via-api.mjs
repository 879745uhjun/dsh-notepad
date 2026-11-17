#!/usr/bin/env node
/**
 * Pushes the current commit through the GitHub REST Git Data API.
 *
 * Why this exists: on some machines `github.com:443` is unreachable while
 * `api.github.com` works (corporate proxies, flaky routes). `git push` then times
 * out, but the same objects can be written through the REST API.
 *
 * The commit is reproduced byte for byte — blobs, tree, parents, message,
 * author/committer identity and dates — so the remote branch ends up pointing at
 * the *same* sha as the local HEAD. Any mismatch aborts before touching the ref.
 *
 * Usage:
 *   node tools/push-via-api.mjs --repo owner/name [--branch main] [--dry-run] [--bootstrap]
 *
 * Auth: `GH_TOKEN` / `GITHUB_TOKEN` in the environment, else `gh auth token`.
 * No token is ever read from or written to disk by this file.
 *
 * Note for reviewers: the REST API does not update git's remote-tracking refs, so
 * after a successful push this script also runs
 * `git update-ref refs/remotes/origin/<branch> <sha>`. Without that, `git status`
 * reports a phantom "ahead N" and looks like the push never happened.
 */
import { execFileSync } from 'node:child_process';

/* ------------------------------------------------------------------ args */

function parseArgs(argv) {
  const args = { repo: null, branch: 'main', dryRun: false, bootstrap: false, remote: 'origin' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') args.repo = argv[(index += 1)];
    else if (arg === '--branch') args.branch = argv[(index += 1)];
    else if (arg === '--remote') args.remote = argv[(index += 1)];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--bootstrap') args.bootstrap = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'usage: node tools/push-via-api.mjs --repo <owner/name> [--branch main] [--dry-run] [--bootstrap]',
    '',
    '  --repo       GitHub repository as owner/name (required)',
    '  --branch     branch to update (default: main)',
    '  --remote     git remote whose tracking ref is refreshed (default: origin)',
    '  --dry-run    verify blobs/tree/commit without writing anything',
    '  --bootstrap  create a throwaway commit first (needed on a brand-new empty repo)',
    '',
    'auth: GH_TOKEN / GITHUB_TOKEN, else `gh auth token`'
  ].join('\n');
}

/* ------------------------------------------------------------------ git helpers */

const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options });

function parseIdent(line, prefix) {
  const rest = line.slice(prefix.length);
  const lt = rest.lastIndexOf('<');
  const gt = rest.indexOf('>', lt);
  const name = rest.slice(0, lt - 1);
  const email = rest.slice(lt + 1, gt);
  const [epoch, tz] = rest.slice(gt + 2).trim().split(' ');
  const sign = tz.startsWith('-') ? -1 : 1;
  const offsetMinutes = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  const stamp = new Date((Number(epoch) + offsetMinutes * 60) * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  const absolute = Math.abs(offsetMinutes);
  const date = `${stamp.getUTCFullYear()}-${pad(stamp.getUTCMonth() + 1)}-${pad(stamp.getUTCDate())}`
    + `T${pad(stamp.getUTCHours())}:${pad(stamp.getUTCMinutes())}:${pad(stamp.getUTCSeconds())}`
    + `${offsetMinutes < 0 ? '-' : '+'}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  return { name, email, date };
}

function readLocalCommit() {
  const raw = git(['cat-file', 'commit', 'HEAD'], { encoding: 'buffer' });
  const split = raw.indexOf('\n\n');
  const header = raw.subarray(0, split).toString('utf8');
  const message = raw.subarray(split + 2).toString('utf8');
  const lines = header.split('\n');
  const field = (name) => lines.find((line) => line.startsWith(`${name} `));
  return {
    sha: git(['rev-parse', 'HEAD']).trim(),
    tree: field('tree').slice(5).trim(),
    parents: lines.filter((line) => line.startsWith('parent ')).map((line) => line.slice(7).trim()),
    author: parseIdent(field('author'), 'author '),
    committer: parseIdent(field('committer'), 'committer '),
    message,
    files: git(['ls-files', '-s']).trim().split('\n').map((row) => {
      const tab = row.indexOf('\t');
      const [mode, sha] = row.slice(0, tab).split(' ');
      return { mode, sha, path: row.slice(tab + 1) };
    })
  };
}

/* ------------------------------------------------------------------ auth + api */

function readToken() {
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv.trim();
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch (err) {
    throw new Error('no token: set GH_TOKEN, or run `gh auth login`');
  }
}

function makeApi(token, owner, repo) {
  return async function api(method, path, body) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'dsh-notepad-push-via-api'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : {};
  };
}

/* ------------------------------------------------------------------ main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.repo || !/^[^/]+\/[^/]+$/.test(args.repo)) {
    console.error(usage());
    throw new Error('--repo owner/name is required');
  }
  const [owner, repo] = args.repo.split('/');
  const token = readToken();
  const api = makeApi(token, owner, repo);
  const commit = readLocalCommit();

  console.log(`local HEAD   ${commit.sha}`);
  console.log(`local tree   ${commit.tree}`);
  console.log(`parents      ${commit.parents.length === 0 ? '(root)' : commit.parents.join(' ')}`);
  console.log(`files        ${commit.files.length}`);

  const branches = await api('GET', '/branches');
  const empty = branches.length === 0;
  if (empty) {
    if (!args.bootstrap) {
      throw new Error('remote repository is empty: the blob API answers 409 until one commit exists; re-run with --bootstrap');
    }
    if (args.dryRun) {
      console.log('dry-run: would bootstrap the empty repository first');
    } else {
      await api('PUT', '/contents/.bootstrap', {
        message: 'chore: bootstrap repository',
        content: Buffer.from('bootstrap\n').toString('base64'),
        branch: args.branch
      });
      console.log('bootstrapped empty repository');
    }
  }

  const treeEntries = [];
  for (const file of commit.files) {
    const content = execFileSync('git', ['show', `HEAD:${file.path}`], { encoding: 'buffer' });
    if (args.dryRun) {
      const local = execFileSync('git', ['hash-object', '--stdin'], { input: content, encoding: 'utf8' }).trim();
      if (local !== file.sha) throw new Error(`blob mismatch for ${file.path}: ${local} vs ${file.sha}`);
      console.log(`blob ok   ${file.path} ${local.slice(0, 8)}`);
    } else {
      const blob = await api('POST', '/git/blobs', { content: content.toString('base64'), encoding: 'base64' });
      if (blob.sha !== file.sha) throw new Error(`blob mismatch for ${file.path}: ${blob.sha} vs ${file.sha}`);
      console.log(`blob ok   ${file.path} ${blob.sha.slice(0, 8)}`);
    }
    treeEntries.push({ path: file.path, mode: file.mode, type: 'blob', sha: file.sha });
  }

  let treeSha = commit.tree;
  if (!args.dryRun) {
    const tree = await api('POST', '/git/trees', { tree: treeEntries });
    if (tree.sha !== commit.tree) throw new Error(`tree mismatch: ${tree.sha} vs ${commit.tree}`);
    treeSha = tree.sha;
  }
  console.log(`tree ok   ${treeSha}`);

  if (args.dryRun) {
    const ref = await api('GET', `/git/ref/heads/${args.branch}`);
    const same = ref.object.sha === commit.sha;
    console.log(`dry-run: remote ${args.branch} = ${ref.object.sha} ${same ? '(identical)' : '(differs, a real run would update it)'}`);
    return same ? 0 : 0;
  }

  const created = await api('POST', '/git/commits', {
    message: commit.message,
    tree: treeSha,
    parents: commit.parents,
    author: commit.author,
    committer: commit.committer
  });
  if (created.sha !== commit.sha) throw new Error(`commit mismatch: ${created.sha} vs ${commit.sha}`);
  console.log(`commit ok ${created.sha}`);

  await api('PATCH', `/git/refs/heads/${args.branch}`, { sha: created.sha, force: true });
  console.log(`ref       refs/heads/${args.branch} -> ${created.sha}`);

  try {
    git(['update-ref', `refs/remotes/${args.remote}/${args.branch}`, created.sha]);
    console.log(`local     refs/remotes/${args.remote}/${args.branch} -> ${created.sha}`);
  } catch (err) {
    console.log(`local     could not update tracking ref: ${err.message.slice(0, 120)}`);
  }

  const final = await api('GET', `/git/ref/heads/${args.branch}`);
  console.log(`remote    ${args.branch} = ${final.object.sha} ${final.object.sha === commit.sha ? '(matches HEAD)' : '(MISMATCH)'}`);
  if (final.object.sha !== commit.sha) throw new Error('remote ref does not point at HEAD after the push');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`failed: ${err.message}`);
    process.exit(1);
  });
