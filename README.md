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

## Data model and security

All workspace data is stored in the current browser under the key `dilg-social-studio:v1`. The Settings page can export and restore a JSON backup. Uploaded images are resized and compressed before storage to reduce browser quota usage.

The app intentionally does not store a Meta access token in local storage. Live Facebook publishing should be added through a server-side Next.js route using Vercel environment variables; the current Publish action manages the local workflow state only.
