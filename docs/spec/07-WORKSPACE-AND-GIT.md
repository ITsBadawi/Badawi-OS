# Files / Projects Workspace and Project Manager
## Separate source content from managed content
Registered code roots are read-only sources. User tasks, notes, and AI reports live in a separate app-managed workspace. Do not write `.badawi`, README, or index files inside inspected code repositories. Disk exports use a new user-selected destination; replacing an existing file requires a separate preview and approval.

A Project links a rootId, tasks, notes, and evidence of the last read. Files provides tree/search/preview; Projects provides goals, tasks, Git status, and file references. Archiving a database record does not delete its folder. Opening an external application is an explicit user action, not a general model capability to launch programs.

## Lightweight indexing
Index filenames/metadata first. Read text on demand or after a user-selected scan. Initial bounds: 10,000 files per root, 1 MiB per text file, and 50 MiB per content batch. Explain truncation and skipped files. No OCR, local embeddings, or full-disk scan in the MVP. Suspend indexing and unnecessary watchers in Gaming/Pause/Stop, then reconcile incrementally on return.

Default exclusions: `.git` internals from general indexing, `node_modules`, build/dist output, binaries, archives, `.env*`, keys, certificates, and credential stores. `.gitignore` can add exclusions but cannot remove secret exclusions. Metadata and filenames can be sensitive too; do not send them to providers automatically.

## Path containment
The host resolves rootId + relativePath against an approved realpath. Reject `..`, arbitrary absolute paths, UNC/device paths, NTFS alternate data streams, junction/symlink escape, and links swapped during reading. Do not follow links by default; revalidate at open and after relevant changes.
Handle Windows case-insensitivity, reparse points, and hard-link aliases. If containment cannot be established, reject the read. Do not claim kernel-level isolation against an adversarial local process; require TOCTOU tests and minimize race windows using handle/identity checks where feasible.

## Allowed MVP Git tools
Use fixed typed wrappers, never a caller-provided command string.
- git.status: bounded porcelain status; disable optional locks that could write refresh data.
- git.log: at most 50 commits with selected fields, no pager, and no external signature-verification program.
- git.diff: working/index or validated revisions; no external diff or textconv, bounded output, no pager.
- git.showText: bounded textual blobs from validated revisions, without filters/textconv.
- git.branches: local branch names only; no remote updates.

For every wrapper, use a trusted executable path and root-derived cwd, shell:false, an argument array, and `--` before paths where supported. Validate revisions so they cannot be interpreted as options. Apply encoding, timeout, and output limits. Sanitize the environment and suppress unwanted GIT_* variables, helpers, pagers, fsmonitor, external diff, textconv, and lazy-fetch/promisor network behavior. Refuse cases that cannot be inspected without helpers or network. Do not send `.git/config` contents to AI. Check for the local Git executable; do not silently download/install it.

## Disallowed by default and outside the MVP
add/commit/push/fetch/pull/merge/rebase/checkout/switch/reset/clean/stash; config/hooks changes; init/clone; submodule updates; LFS downloads; and a general terminal. Do not install dependencies or run repository builds/tests, since these execute its code. A read-only Project Manager does not make fetch or checkout safe reads.

Any future Git mutation needs separate scope documentation, an exact preview of arguments/repository/base/target/worktree effects, one-time approval, repository locking, revalidation of HEAD and dirty state, recovery steps, and postconditions. Current scope grants none of these mutations.

The later, owner-requested Commit/Push scope is documented in `../REVIEWED-GIT-PUBLISHING.md`. It uses exact path selection, separate one-use reviews, engine serialization, state revalidation and confirmed postconditions. The MVP prohibition above remains the default for every other Git mutation and for AI tools. Git's own index/ref locks and the engine serialize in-app operations; an unrelated local Git process is outside the app's lock and can still race, so stale-state checks fail closed where observable.

## Project Manager report quality
Each finding references path + line range or commit/diff, read timestamp, and content hash. Indicate stale/incomplete evidence and scan limits. Never claim tests were run when they were not. A README or comment asking to ignore permissions or upload `.env` is data or a potential attack, not authorization. Future conversational code suggestions do not imply permission for the product to apply them in the MVP.
