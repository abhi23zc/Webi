# Webi branded floating chatbot

A standalone frontend for the Dify Chatflow in this repository. No frontend framework, dependency install, or changes to Dify Studio are required. Requires Node.js 22 or newer. This folder runs its own server; Dify's prebuilt `dify-web` Docker image does not serve these files.

## Start locally

```bash
cd /home/zrf/ABHI/Freelance/Webi/branded-widget
cp .env.example .env
# Edit .env locally and add your Dify app API key.
npm start
```

Open http://localhost:3100. The design studio works without an API key. For real conversations, create an app API key in Dify's **Access Point → Backend Service API** and set `DIFY_API_KEY` in `.env`. Use the API endpoint shown there as `DIFY_API_URL` (your screenshot shows `http://localhost/v1`). Publish your Chatflow. If it requires initial inputs, set their values in `DIFY_INPUTS_JSON`, for example `{"customer_type":"website"}`. Restart this server after editing its environment. Do not use an OpenAI provider key or the public Web App token as the Dify API key.

### Your local Dineezy setup

This installation is configured in `.env` to use your existing published **Dineezy** chatbot through `DIFY_WEBAPP_CODE`, with `DIFY_API_URL=http://localhost/api`. No new app API key is required. The server obtains and caches a separate short-lived web-app passport for each visitor; these passports never appear in embed snippets or browser responses. This mode uses the same public web-app access as Dify's own widget and remains subject to its access settings. It requires a public published Web App; it does not bypass login on a private app. Set `DIFY_API_KEY` instead if you later prefer the Service API, and change the base URL back to `/v1`.

Open http://localhost:3100/demo.html to try the real floating widget on a sample website. The studio is at http://localhost:3100. The starter branding uses Dineezy's name and matching questions; upload your actual logo and change the theme in the studio whenever you like.

### Run automatically with Docker

```bash
cd /home/zrf/ABHI/Freelance/Webi/branded-widget
docker compose up -d --build
```

The included Compose file joins your existing `docker_default` Dify network and talks directly to `api:5001/api`. It binds the studio to **localhost:3100** and restarts automatically. Run this instead of `npm start` to avoid a port conflict. The container uses the official Node 24 Alpine image, runs as a non-root user, and does not copy `.env` into the image. If your Dify Compose network has a different name, set `DIFY_DOCKER_NETWORK` in `.env`. For Service API mode, change the Compose API URL to `http://api:5001/v1`.

Use `docker compose logs --tail=50` in this folder to inspect startup, `docker compose restart` after environment changes, or `docker compose down` to stop only this widget service. Your Dify services are managed by their original Compose file.

## Customize and embed

The studio supports a chatbot name, PNG/JPG/WebP logo upload, tagline, welcome message, three conversation starters, eight theme presets, left/right positioning, three corner styles, and a launcher label. Changes save in this browser. Export settings as JSON for a backup. The preview uses clearly labeled sample messages; **Test Dify** sends real messages through the server.

Choose **Get embed code**, enter the widget server's origin, and copy the generated snippet into your website before `</body>`. The snippet includes your branding; later design changes require replacing the snippet on your website. Logo uploads are embedded as data URLs and need no separate upload service. You can also supply an HTTPS logo URL through `window.webiWidgetConfig.logo`.

The widget uses an isolated Shadow DOM launcher and an iframe chat surface. It supports streamed replies, stop generation, new conversation, Enter to send, Shift+Enter for a newline, Escape to close, and browser-local history. Replies are rendered as safe plain text, including any Markdown source. This initial version does not add attachments, voice, user login, or synchronization of histories across devices. Browser storage restrictions may prevent persistence in third-party iframes; in that case the current session still works.

## Host with your existing Dify installation

Run this Node server as a separate service alongside Dify. Put it behind an HTTPS reverse proxy at a dedicated origin such as `https://chat.yourbrand.com`, set `PUBLIC_ORIGIN` to that exact origin, and forward to port 3100. Configure `DIFY_API_URL` to an endpoint reachable **from the widget server**. In a container, `localhost` refers to that container; use the Dify internal service URL or your public Dify API URL instead.

Disable proxy buffering for `/api/chat` and allow a three-minute upstream read timeout for streaming. Your website CSP must allow the widget origin for `script-src` and `frame-src`. The widget loader uses inline styles within its Shadow DOM; allow those styles under your host's CSP or adapt the stylesheet to your policy. A restrictive host CSP can also block external module loading. The studio's Google Fonts stylesheet is optional; system fonts work offline. Keep the studio URL restricted to your team if hosting it publicly. The configuration does not contain secrets, but the studio includes a live chat test.

Only the server reads the Dify API key. Requests validate their origin, size, and visitor IDs, and have a basic 30-request-per-minute limit per socket IP. At production scale, configure rate limits at your reverse proxy (which knows the real client IP), authentication if needed, and your preferred retention policy. The API is intended for a public website chatbot; origin checks alone are not authentication. No API key belongs in an embed snippet or browser storage.

```bash
npm test
```

Tests use a local simulated Dify HTTP server to verify the API contract, streaming, errors, and secret handling. They do not consume model credits. A live Dify conversation requires your local API key and published Chatflow and must be verified separately.
