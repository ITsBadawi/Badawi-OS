# Badawi OS 0.2.1

2026-10-22. Fix actual Drive HTTP 308 resumable-upload receipts: manual redirect mode exposes progress without following redirects. A real HTTP regression test reproduces the old failure. Live OAuth, refresh, interrupted upload/resume, listing, encrypted download and exact synthetic restore pass. Owner Drive setup and recovery-key export are complete locally. Credentials, keys and owner database are excluded from distributions.

Google external/testing refresh tokens expire after seven days for Drive scopes; reconnect when requested. The app was not publicly published. Official policy: https://developers.google.com/identity/protocols/oauth2/
