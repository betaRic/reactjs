# DILG Social Studio

A separate Next.js rebuild of the NAS5 Facebook Poster workflow for DILG General Santos City. The original NAS application remains untouched in the parent folder.

## Stack

- Next.js 16 and React 19
- Node.js runtime for Next.js and the health endpoint
- Tailwind CSS 4 plus a custom responsive design system
- Motion for page and composer transitions
- Browser local storage for campaigns, photos, templates, settings, and activity
- Vercel Blob direct uploads for campaign videos
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

Import this repository in Vercel. The Next.js application is at the repository root, so no custom Root Directory or build command is required.

The current production URL is `https://socialmedia-dilg12.vercel.app/`.

### Secure Facebook publishing

Add these variables in **Vercel → Project Settings → Environment Variables** for Production, Preview, and Development as appropriate:

```text
FACEBOOK_PAGE_ID
FACEBOOK_PAGE_ACCESS_TOKEN
FACEBOOK_PUBLISH_KEY
FACEBOOK_GRAPH_API_VERSION=v25.0
BLOB_READ_WRITE_TOKEN
```

`FACEBOOK_PAGE_ACCESS_TOKEN` must be a Page/System User token with at least `pages_manage_posts` and `pages_read_engagement` for the target Page. `FACEBOOK_PUBLISH_KEY` is a separate strong secret that protects the publishing endpoints because this device-local app does not have user accounts. Enter that publishing key in the app under **Settings → Facebook connection**; it is retained only for the browser session.

The secure server workflow prepares the selected template on every photo, uploads each photo as unpublished media, then creates one multi-photo Page feed post. A photo My Day/Story uses the first campaign photo in a generated 1080 × 1920 layout. Video campaigns use one MP4, MOV, or WebM file and can publish to the Page Feed, My Day, or both.

### Enable video uploads

In Vercel, open **Storage**, create a **Blob** store, choose **Public**, and connect it to this project. Vercel adds `BLOB_READ_WRITE_TOKEN` to the project automatically; redeploy after connecting the store. Videos upload directly from the browser to Blob instead of passing through a Vercel Function, so files up to the composer’s 500 MB limit are supported.

Public Blob storage is intentional: Meta must be able to fetch the video URL during publishing. The Blob token remains server-only. The composer accepts one video per campaign, and a My Day video must be 60 seconds or shorter.

### Feed and My Day behavior

- Choose **Facebook Feed**, **My Day / Story**, or both in the campaign composer.
- Feed posts use the campaign caption. My Day does not include the caption.
- Photo My Day publishing uses the first photo; rearrange photos to select it.
- My Day publishes immediately and remains visible on Facebook for 24 hours.
- Scheduled publishing is available for Feed-only campaigns. A campaign that includes My Day cannot be scheduled through this integration.

## Data model and security

Workspace records are stored in the current browser under the key `dilg-social-studio:v1`. The Settings page can export and restore a JSON backup. Uploaded photos are resized and compressed before local storage; videos remain in Vercel Blob and the local campaign stores only their public URL and metadata.

The app never stores or returns the Meta Page access token in browser storage. Only the server-side Next.js routes can read it from Vercel. The session publishing key is not included in local backups or exports.
