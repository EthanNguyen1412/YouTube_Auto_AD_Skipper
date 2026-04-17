# Publishing Guide

This guide describes the release and GitHub publication flow for `YouTube Auto Ad Skipper`.

## 1) Update release metadata

- Increase `version` in `manifest.json`.
- Verify repository links and contact information:
  - `homepage_url` in `manifest.json`
  - `PRIVACY_POLICY.md`
  - `TERMS.md`

## 2) Validate locally

- Load unpacked extension in `chrome://extensions`.
- Verify ad skip behavior in foreground and background YouTube tabs.
- Verify there are no critical console/runtime errors.

## 3) Build release ZIP

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

Expected output:

- `dist/yt-auto-ad-skipper-v<version>.zip`

## 4) Publish source to GitHub

Use the provided script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\push-github.ps1
```

Optional parameters:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\push-github.ps1 `
  -RepoUrl "https://github.com/EthanNguyen1412/YouTube_Auto_AD_Skipper.git" `
  -Branch "main" `
  -CommitMessage "chore: release v1.3.0"
```

## 5) Chrome Web Store submission

- Upload ZIP from `dist/`.
- Provide store assets (icons/screenshots).
- Add support and privacy policy URLs.
- Submit for review.
