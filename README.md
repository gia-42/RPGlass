# RPGlass

A basketball career told with dice. Roll your player, survive draft night and chase rings, MVPs and the Hall of Fame in the NBA or the WNBA.

**Play:** https://gia-42.github.io/RPGlass/

## Install on a phone

- **iPhone / iPad:** open the link in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the link in Chrome and tap **Install app** (or the ⋮ menu > **Add to Home screen**).

## Files

| File | What it is |
|---|---|
| `index.html` | The whole game |
| `config.js` | Account settings (shared Supabase project with RPGoal) |
| `cloud.js` | Login and saving to your account |
| `supabase-setup.sql` | Creates the `rpglass_saves` table in Supabase (run once) |
| `manifest.webmanifest`, `icons/`, `favicon.svg` | App name and icons |
| `sw.js` | Offline support. Bump `VERSION` when you upload changes |

## How saving works

- Logged out: the career, Hall of Fame and achievements live on the device.
- Logged in: every change is saved to your account a moment later, and again when you leave the app. Opening the game on another device loads the furthest-along copy of your career and merges both Halls of Fame and achievement lists.
- On iPhone, the home-screen app and Safari keep separate local saves; logging in to the same account on both keeps them in sync.
