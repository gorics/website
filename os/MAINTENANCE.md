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

The web shell release and the guest ISO release are separate. The R19 shell currently boots the verified `r12-visible-desktop` guest ISO.

## Performance rules

- Never download the full kernel, initrd, ISO, or disk images on initial page load.
- Prefetch only after clear user intent and use a small byte range.
- Do not globally replace `fetch`, `setInterval`, or the v86 constructor for performance tuning.
- Do not unregister service workers or delete all v86/ISO caches on every boot.
- Keep logs bounded to prevent long sessions from continuously growing DOM text.

## Input and responsive rules

- The v86 input surface must match the rendered guest canvas dimensions.
- Recalibrate after guest resolution changes, viewport resize, orientation changes, fullscreen transitions, and visual viewport changes.
- Preserve a minimum 280 px layout width and safe-area insets.

## Verification

Canonical workflow: `.github/workflows/verify-real-multiboot-r19-v2.yml`

Browser verifier: `.github/scripts/verify-real-multiboot-r19.mjs`

Only the canonical workflow may publish `os/iso/real-multiboot-status.json`. Obsolete versioned verifiers must not be restored because competing status writers create nondeterministic hub results.

The workflow checks:

1. JavaScript syntax and required DOM IDs.
2. ISO metadata and local boot asset metadata.
3. GitHub Pages deployment visibility.
4. Chromium startup of the GORICS preset.
5. `emulator-started`, a visible canvas of at least 640×480, and the UI running state.
6. Publication of a failure-safe diagnostic result to `os/iso/real-multiboot-status.json`.

A green page badge must only be shown when all graphical boot conditions are true.
