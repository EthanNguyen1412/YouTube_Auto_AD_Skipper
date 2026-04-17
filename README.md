# YouTube Auto Ad Skipper (Chrome Extension, MV3)

Production-oriented Chrome extension to auto-skip skippable YouTube ads in background tabs without controlling the physical mouse pointer.

## Key features

- Background monitoring for YouTube tabs (`www.youtube.com`, `m.youtube.com`)
- Multi-layer skip execution:
  - MAIN world DOM click
  - isolated content-script fallback
  - CDP debugger input fallback for stricter players
- Robust dynamic wait logic (opacity, disabled state, delayed skip availability)
- Heartbeat alarm to keep background behavior stable across inactive tabs

## Tech stack

- **Manifest V3 Extension**
- **Service worker** for lifecycle, tab events, heartbeat, debugger fallback
- **Content script + DOM utilities** for detection and local click behavior
- **Vanilla JavaScript** (no framework dependency)

## Project structure

```text
YT_Skipper/
├─ manifest.json
├─ README.md
├─ LICENSE
├─ PRIVACY_POLICY.md
├─ TERMS.md
├─ RELEASE_CHECKLIST.md
├─ PUBLISHING.md
├─ scripts/
│  ├─ package.ps1
│  └─ push-github.ps1
└─ src/
   ├─ background/
   │  └─ service-worker.js
   ├─ content/
   │  └─ ad-skipper.js
   └─ utils/
      └─ dom.js
```

## Local install

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `c:\YT_Skipper`
5. Open YouTube and test playback

## Build release package

Run from project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

Output:

- `dist/yt-auto-ad-skipper-v<version>.zip`

## Push source to GitHub

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\push-github.ps1
```

## Productization notes

- Update version in `manifest.json` before each release.
- Keep support URL, privacy policy URL, and contact details up to date.
- Review `RELEASE_CHECKLIST.md` before publishing.
- For Chrome Web Store, prepare icons and screenshots.
- Follow `PUBLISHING.md` for full release/push flow.

## Legal docs

- Privacy: `PRIVACY_POLICY.md`
- Terms: `TERMS.md`
- License: `LICENSE`
