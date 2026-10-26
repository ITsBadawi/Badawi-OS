# Smart Dashboard and User Experience
## Screen hierarchy
A persistent top bar shows workspace, engine state, Gaming switch, and last update. Separate actions: Run, Pause, and Stop Engine. Below: current work, items requiring the user's decision, upcoming/deferred jobs, projects, backups, and costs. Dashboard refresh must not call AI.

## States and suggested messages
These English messages define meaning; localize the actual MVP interface concisely into Arabic.
- Stopped: "Engine stopped. Schedules will not run until you select Run." Files and notes remain available.
- Pausing: "Pausing safely — finishing a backup chunk." Show the operation, elapsed time, and details; do not show an unexplained spinner.
- Paused: "Automation paused. 3 occurrences deferred." Show individual reasons and missed policies without suggesting execution continues.
- Stopping: "New work blocked. Saving progress for 2 operations." Do not label it Stopped before quiescence.
- Running + Gaming: "Gaming Mode on: indexing, backups, and background AI are suspended." "Next backup: 9:00 PM — will be deferred if Gaming remains on."
- Gaming draining: "Reducing activity — resolving an in-flight upload chunk." Do not display "FPS protected" as an unmeasured claim.
- Missed on return: "5 occurrences missed: 4 will be skipped; 1 backup needs your decision." Offer details, run permitted work, or leave deferred. No ambiguous run-everything button.
- Offline: "No connection: 2 jobs waiting for network. Local files remain available."
- Stale: "Project status from 20 minutes ago — refresh suspended by Gaming Mode." Never present stale data as live.

## Engine interaction
All controls work with a keyboard and announce state to a screen reader. Repeated clicks do not duplicate mutations; version conflicts refresh the actual state. Do not require repeated approval dialogs for Pause/Stop/Gaming. If an indivisible operation is draining, explain it and expose options after the timeout.
Run Now cannot bypass Stop/Pause/Gaming; explain the block and let the user change mode explicitly. For manual AI during Gaming, offer cancel or explicitly disable Gaming and run that specific request. Never silently turn Gaming off.

## Creating automation
Short goal → optional AI draft or local template → preview sources, tools, next three occurrences/time zone, destinations, provider/model, cost cap, and Pause/Stop/Gaming/missedPolicy effects. Save Draft is separate from Enable. Changes to content, files, or tools invalidate prior approval. An unsupported proposal shows a reason rather than becoming a shell script.

## Approvals and privacy
One clear card per exact plan: what is read, what is sent, who receives it, what is written, and where. Offer once or a bounded recurring recipe grant. Make rejection and revocation easy in Settings. Never display API keys or raw OAuth/session URLs in normal UI or notifications. Sensitive content belongs inside the application, not system toasts.

## Simplicity and performance
Arabic/RTL interface with short text, LTR paths and technical identifiers, one primary action per card, and collapsible details. Virtualize long lists, use event-driven updates rather than fast polling, and stop unnecessary animation/repainting when hidden. Generate bounded previews/thumbnails on demand; never execute HTML/macros or autoplay media in previews.
Resource estimates may refresh every 5–10 seconds only while the resource panel is open. No permanent FPS overlay in the MVP.

## Onboarding
1. Select a project folder or an in-app notes workspace; do not scan the whole disk.
2. Gemini/OpenAI are optional. Store keys securely and select a verified model. A connection test explains that it may consume credits.
3. Drive is optional. Explain scope, encryption, and recovery-key handling before enabling backups.
4. Demonstrate engine/Gaming controls with a local fake job.
5. First launch is Stopped; auto-start and tray are off, with brief explanations of how to opt in.
