# DILG Social Studio

A separate Next.js rebuild of the NAS5 Facebook Poster workflow for DILG General Santos City. The original NAS application remains untouched in the parent folder.

## Stack

- Next.js 16 and React 19
- Node.js runtime for Next.js and the health endpoint
- Tailwind CSS 4 plus a custom responsive design system
- Motion for page and composer transitions
- Browser local storage for campaigns, images, templates, settings, and activity
- Vercel-ready project structure

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production checks

```powershell
npm run lint
npm run build
```

## Deploy on Vercel

Import this repository in Vercel and set the **Root Directory** to `reactjs`. Vercel will detect Next.js automatically; no custom build command is required.

The current production URL is `https://socialmedia-dilg12.vercel.app/`.

### Secure Facebook publishing

Add these variables in **Vercel → Project Settings → Environment Variables** for Production, Preview, and Development as appropriate:

```text
FACEBOOK_PAGE_ID
FACEBOOK_PAGE_ACCESS_TOKEN
FACEBOOK_PUBLISH_KEY
FACEBOOK_GRAPH_API_VERSION=v25.0
```

`FACEBOOK_PAGE_ACCESS_TOKEN` must be a Page/System User token with at least `pages_manage_posts` and `pages_read_engagement` for the target Page. `FACEBOOK_PUBLISH_KEY` is a separate strong secret that protects the publishing endpoints because this device-local app does not have user accounts. Enter that publishing key in the app under **Settings → Facebook connection**; it is retained only for the browser session.

The secure server workflow prepares the selected template on every image, uploads each image as unpublished media, then creates one multi-photo Page feed post. Scheduled campaigns are submitted as unpublished scheduled Page posts.

## Data model and security

All workspace data is stored in the current browser under the key `dilg-social-studio:v1`. The Settings page can export and restore a JSON backup. Uploaded images are resized and compressed before storage to reduce browser quota usage.

The app never stores or returns the Meta Page access token in browser storage. Only the server-side Next.js routes can read it from Vercel. The session publishing key is not included in local backups or exports.
