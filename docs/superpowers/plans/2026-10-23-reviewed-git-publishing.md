# Reviewed Git publishing

## Goal

Let the owner choose changed files, review the exact local commit, then separately review and approve a push to the linked GitHub repository. Recently changed files appear in the selection list; nothing is selected automatically. An AI recommendation may only propose a selection in a later unit and cannot bypass either review.

## Safety contract

- The linked project must have a simple local Git repository and a GitHub owner/repository/branch. Only an exact GitHub HTTPS target is allowed for push.
- A preview records the repository path, HEAD, branch, changed-file list, selected file bytes/status, linked target and credential identity. It expires after five minutes and is single use. A changed project, file, index, HEAD, branch, link or credential invalidates it.
- Commit requires an initially clean index, selected regular files or tracked deletions, no secret paths/symlinks, and bounded sizes. It stages only reviewed paths. Hooks, signing, filters, submodules, helpers and external programs are disabled or refused. The working files are never rewritten.
- Push has its own review and one-use approval. The remote branch head is read again before transfer. The explicit destination is the linked GitHub HTTPS branch. Non-fast-forward is rejected. A push failure leaves the local commit intact and reports uncertainty if the network outcome cannot be confirmed.
- Repository work is serialized through the engine. Mode, Gaming and cancellation gates apply. The owner can recover from a failed commit by inspecting Git status; a partial staging state is never silently reset.

## Execution

1. Write focused local-repository tests for selection, untracked/modified/deleted paths, stale review, secret rejection, hooks and unchanged unselected files. Confirm red.
2. Implement typed Git preview/apply operations and service approvals.
3. Add project UI with file selection and distinct commit/push review screens, plus Arabic/English labels.
4. Run focused tests, complete core suite, build and actual Electron UI checks; record limits in the working status.

## Follow-on: owner-reviewed AI selection

1. Add a failing test where an assistant can propose exact changed paths only after a bounded `git.changes` read, but a stale HEAD/status or blocked secret path is rejected.
2. Add a typed `git.selection.propose` assistant action with the existing approval-card policy. It stores only a transient file selection and explanation, never stages, commits or pushes.
3. Show the approved proposal in the Projects file picker, preserving the owner's ability to change any checkbox and requiring the existing Commit and Push reviews.
4. Verify selected-file chat scope, native picker behavior, full tests, build and localization.
