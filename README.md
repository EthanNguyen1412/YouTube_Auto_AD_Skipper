# YouTube_Auto_AD_Skipper (Chrome Extension, MV3)

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
YouTube_Auto_AD_Skipper/
├─ manifest.json
├─ README.md
├─ LICENSE
├─ PRIVACY_POLICY.md
├─ TERMS.md
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
4. Select `c:\YouTube_Auto_AD_Skipper`
5. Open YouTube and test playback

## Legal docs

- Privacy: `PRIVACY_POLICY.md`
- Terms: `TERMS.md`
- License: `LICENSE`
