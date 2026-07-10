# GORICS OS maintenance

## Canonical runtime

- Public hub: `/website/os/`
- Canonical VM UI: `/website/os/real-multiboot/`
- GORICS guest: `preset=gorics`
- Other supported presets: `buildroot`, `dsl`, `tiny`, `freedos`, `buildroot-serial`, `dsl-high`
- `os/linux/*` and `os/quantum-real/` are compatibility routes. They must redirect to the canonical VM UI instead of loading another v86 runtime.
- `os/window/` is a status page. Do not label it as a runnable Windows VM until a legally distributable guest image and browser-boot verification are present.

## Runtime assets

- v86 runtime: `/website/vendor/v86/`
- GORICS kernel/initrd: `/website/os/real-multiboot/assets/`
- ISO metadata: `/website/os/real-multiboot/assets/iso-meta.json`
- Chunked ISO source: repository branch `os-assets`, directory `os/real-multiboot/assets/v86-parts/`
- Local preset media: `/website/vendor/v86/images/`

The web shell release and the guest ISO release are separate. The R19 shell currently boots the verified `r12-visible-desktop` guest ISO.

## Performance rules

- Never download the full kernel, initrd, ISO, or disk images on initial page load.
- Prefetch only after clear user intent and use a small byte range.
- Do not globally replace `fetch`, `setInterval`, or the v86 constructor for performance tuning.
- Do not unregister service workers or delete all v86/ISO caches on every boot.
- Keep visible logs bounded to prevent long sessions from continuously growing DOM text.

## Input and responsive rules

- The v86 input surface must match the rendered guest canvas dimensions.
- Recalibrate after guest resolution changes, viewport resize, orientation changes, fullscreen transitions, and visual viewport changes.
- Preserve a minimum 280 px layout width and safe-area insets.

## Deployment and verification

Deployment dispatcher: `.github/workflows/force-real-multiboot-deploy.yml`

Canonical verification: `.github/workflows/verify-real-multiboot-r19-v2.yml`

Browser verifier: `.github/scripts/verify-real-multiboot-r19.mjs`

Runtime, v86, deployment-workflow, or verifier changes trigger the deployment dispatcher. It deploys the exact triggering main-branch commit, waits until `assets/deployment.json` reports that commit, verifies all local preset media, and only then dispatches the canonical graphical verification.

The canonical verification is `workflow_dispatch` only. Do not add a direct runtime-file push trigger, because it can start before GitHub Pages finishes deploying and produce false 404 failures. Canonical runs are never cancelled in favor of another run, and a cancelled run must never publish status.

Only the canonical verification may publish `os/iso/real-multiboot-status.json`. Obsolete versioned verifiers and separate media-probe status writers must not be restored because they create duplicate browser runs, extra commits, and nondeterministic hub results.

The canonical verification checks:

1. JavaScript syntax, required DOM IDs, and R19 hardening markers.
2. GORICS ISO metadata and direct-boot files.
3. Public local media for Buildroot, DSL, Tiny Linux, and FreeDOS.
4. GitHub Pages deployment visibility.
5. Chromium startup of the GORICS preset.
6. `emulator-started`, a visible canvas of at least 640×480, and the UI running state.
7. Publication of a failure-safe diagnostic result to `os/iso/real-multiboot-status.json`.

A green page badge must only be shown when all graphical boot conditions are true.
