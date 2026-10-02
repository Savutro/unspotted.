# Unspotted

A simpler, personal Spotify frontend: playlists, liked songs, track search, playback controls, and a device picker. The connected home screen puts search, shortcuts, your current listening session, and playlists within reach. Play directly from a playlist card or switch between **Grid** and **List**; the layout preference is remembered on this device and shared between Home and Your library. A static progressive web app designed for an iPhone home screen and GitHub Pages. Built with vanilla JavaScript and Vite; no application server or client secret.

## Run locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. Spotify accepts the loopback IP for development; `localhost` is not an accepted Spotify redirect host. Live account access needs the setup below. The welcome screen works without credentials.

## Deploy on GitHub Pages

1. Put this project in your own GitHub repository and push to its `main` branch.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Run the **Deploy Unspotted to GitHub Pages** workflow (or push another commit). It tests, builds, and deploys `dist/`.
4. Open `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/` with the trailing slash.

All asset URLs, the web app manifest, service worker scope, and OAuth redirect support repository subpaths as well as custom domains. There are no nested routes requiring a Pages fallback. If your default branch differs, edit `.github/workflows/pages.yml`.

You can also host `dist/` on any static HTTPS host:

```sh
npm run build
npm run preview
```

## Connect your Spotify account

1. With your **Spotify Premium** account, create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Choose **Web API** and **Web Playback SDK**.
2. Add your exact deployed URL, including its trailing slash, as a **Redirect URI**, e.g. `https://YOUR-USERNAME.github.io/unspotted/`. Add `http://127.0.0.1:5173/` separately if developing locally.
3. Add your Spotify account under the app's **User Management** allowlist.
4. Set `SPOTIFY_CLIENT_ID` in `src/config.js` to your app’s public **Client ID**, then build and deploy. This is the single shared configuration for every visitor.
5. In Unspotted, click **Connect with Spotify** and approve access. Users never enter a Client ID or go through an app-setup form.

The Client ID is public and is intentionally embedded in the frontend. **Never paste or commit a client secret.** There is no browser configuration or environment-variable override. If the ID is missing, Connect shows a configuration error without starting OAuth. Existing browser-stored IDs cannot override the configured app; changing the configured ID discards tokens belonging to a different app.

Spotify currently requires Premium for development-mode app owners and supports up to five allowlisted users for new apps. This is intended for personal use. Some playlist contents are available only for playlists you own or collaborate on; Unspotted keeps a playlist's play button available when its track list is restricted. There is a single Open Spotify link in the Home footer; playlist rows, song rows, and the player have no repeated external links. Search uses the current 10-result limit. See [Spotify's development mode documentation](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) and [API migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).

## Developer account, cost, and other users

The developer dashboard uses your regular Spotify account. Registering an app creates a **Client ID** identifying your frontend, its redirect URLs, and its allowed users; it does not log everyone into the developer's music account. Each listener authorizes the same Client ID with their own Spotify account and gets their own library.

There is no separate developer membership or per-call API charge for this personal setup. Spotify staff describe [API access as free of charge](https://community.spotify.com/t5/Spotify-for-Developers/Developer-API-Pricing-Quota-Legalities/td-p/5225009). The current [development-mode rules](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) require the app owner to maintain Premium, and each person streaming through the [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) needs Premium. Your existing subscription satisfies that requirement; registering this frontend does not require a second subscription. Rate limits, quotas, and endpoint restrictions still apply. Spotify supports [personal, non-commercial development projects](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security).

The five-user limit is an **allowlist**, not five shared profiles or five free subscriptions. In Dashboard → your app → Settings → User Management, add each person's Spotify name/email. Share the deployed URL, then have each person connect their own account. The shared Client ID is already part of the app. They do not each need to register a developer app. Accounts outside the allowlist can sometimes complete login but receive HTTP 403 when using the API.

### Why sign-in can happen automatically

Unspotted remembers its own authorization tokens on this device. Spotify separately remembers the account signed into its website. Previously, a new authorization request also used Spotify's default behavior, which can skip approval for an account that already approved the app. None of those behaviors are determined by the five-user limit.

Explicit sign-in now sends **`show_dialog=true`**, requesting Spotify's approval screen again. This is a consent prompt, **not a guaranteed account chooser**. See [Spotify's authorization parameters](https://developer.spotify.com/documentation/web-api/tutorials/code-flow).

To change account, open your account button → **Switch Spotify account**. Sign out of Spotify in the same browser and sign into the desired account, then return and select **Continue to Spotify**. This clears Unspotted's local login and requests authorization again, while retaining the layout preference and using the same configured Client ID. Disconnecting Unspotted alone does not sign you out of Spotify's website. The installed iPhone web app may use separate storage from Safari, so check the account displayed by Spotify during authorization.

## Updating an existing Spotless installation

The app name, browser title, home-screen metadata, icons, and Spotify playback-device name are now **Unspotted**. Existing saved credentials migrate once on the same origin and path. The rebrand does not require renaming your repository or changing an existing Redirect URI. If you choose to change the hosted URL, register that new exact URL in Spotify and sign in again there.

Rename the app in the Spotify Developer Dashboard as well if you want Spotify's consent screen to say Unspotted; that name is managed by Spotify, not the frontend. An existing iPhone shortcut can retain its old label/icon; remove that shortcut and add the updated site again if necessary.

## Add to your iPhone home screen

1. Open the deployed HTTPS URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Enable **Open as Web App** if shown, then tap **Add**.
4. Launch Unspotted from its icon and sign in there. Safari and the installed app may have separate sign-in storage.

The app includes a standalone manifest, PNG app icons, an Apple touch icon, safe-area spacing, large touch targets, and an offline app shell. [Apple's installation instructions](https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios).

## Playback

The title bar stays visible as you scroll. The persistent player provides **Previous track**, **Play/Pause**, **Next track**, and **Shuffle** on desktop and iPhone. Shuffle shows an On/Off label and follows the actual Spotify device state. Controls wait for each command to finish and respect playback restrictions reported by Spotify. Starting a song from inside a playlist retains the playlist context so previous, next, and shuffle continue within that playlist.

- **In this browser:** tap the device icon → **Enable this browser**. When **Unspotted** appears, select it, then tap Play. If it hasn't appeared yet, use Refresh devices. An extra Play tap may be needed on iOS after a device transfer.
- **In the Spotify app or on a speaker:** start a song in Spotify, open Unspotted's device picker, then select that device. Unspotted controls its playback through Spotify Connect. The native Spotify app handles background audio when selected.

Browser playback uses Spotify's official Web Playback SDK and requires Premium. Protected-media support and background/lock-screen behavior depend on the browser and iOS; they must be verified on your physical iPhone. This PWA does not guarantee native-app background behavior, provide offline downloads, or replace Spotify's audio licensing. Its shell opens offline; Spotify API calls and audio require a connection. See [Spotify Web Playback SDK limitations](https://developer.spotify.com/documentation/web-playback-sdk).

## Privacy and authentication

Authorization Code with PKCE (S256), random state validation, a 10-minute login transaction lifetime, and automatic token refresh. Access and refresh tokens are stored locally in this browser, scoped to the deployment path. The public Client ID is in `src/config.js`; a local copy only tracks which app issued a saved session. Disconnect clears the tokens from this device; revoke access in Spotify account settings to revoke the grant itself. As with other static browser clients, scripts running on this origin can access local storage, so use a trusted hosting origin.

Only static app assets enter the service worker cache. It never caches Spotify API responses, audio, OAuth callback URLs, or tokens. External fonts are optional; system fonts work offline. No analytics or application backend is included.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests create a separate optimized build in `dist-e2e/` with a test-only Client ID and serve it under the original `/spotless/` repository path. The deployable `dist/` and `src/config.js` are never changed by that test build. Tests exercise mobile and desktop layouts, PKCE login, forged-callback rejection, token refresh, playlist and search requests, playback/device commands, offline loading, grid/list persistence, home shortcuts, account switching, and migration of an existing login. Spotify is mocked in automated tests; live account authorization, DRM audio playback, and physical iPhone installation need a configured Spotify app and device testing.

The repository includes a Pages deployment workflow; creating the GitHub repository, configuring Pages, and registering your Spotify app are account-owner steps. No deployment or live Spotify connection is implied by a successful local build.
