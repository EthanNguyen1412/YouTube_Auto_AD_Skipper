# Release Checklist

## Product readiness

- [ ] Update `manifest.json` version.
- [ ] Verify extension name, description, and homepage URL.
- [ ] Verify `PRIVACY_POLICY.md` and contact info.
- [ ] Verify `TERMS.md`.

## QA

- [ ] Test on Windows Chrome stable.
- [ ] Test on at least one additional machine/profile.
- [ ] Confirm skip works in foreground and background tabs.
- [ ] Confirm no physical mouse takeover.
- [ ] Confirm no fatal console errors.

## Packaging

- [ ] Run `powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1`
- [ ] Confirm ZIP exists in `dist/`.
- [ ] Install ZIP build locally via unpacked folder smoke test before upload.

## Store publication (if needed)

- [ ] Prepare icon set (16/32/48/128).
- [ ] Prepare screenshots and store listing text.
- [ ] Upload package to Chrome Web Store Developer Dashboard.
- [ ] Set support URL and privacy policy URL.
