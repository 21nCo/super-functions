import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';

const tag = process.argv[2];
if (!tag || !/^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(tag)) throw new Error('Expected a release tag, not a branch or revision expression');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const ref = `refs/tags/${tag}`;
git('show-ref', '--verify', ref);
const commit = git('rev-parse', `${ref}^{commit}`);
if (git('rev-parse', 'HEAD') !== commit) throw new Error(`HEAD must be the immutable tag ${ref} (${commit})`);
if (process.argv[3] && process.argv[3] !== commit) throw new Error(`Tag ${tag} moved since its build at ${process.argv[3]}`);
// Detect deletion or movement after checkout, including annotated tags.
const refs = git('ls-remote', '--exit-code', 'origin', ref, `${ref}^{}`).split('\n').map(line => line.split(/\s+/));
const remote = refs.find(([, name]) => name === `${ref}^{}`) ?? refs.find(([, name]) => name === ref);
if (remote?.[0] !== commit) throw new Error(`Remote tag ${tag} no longer identifies checked-out commit ${commit}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `release_commit=${commit}\n`);
console.log(commit);
