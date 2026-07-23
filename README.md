# DILG Social Studio

A separate Next.js rebuild of the NAS5 Facebook Poster workflow for DILG offices across Region XII. The original NAS application remains untouched in the parent folder.

## Stack

- Next.js 16 and React 19
- Node.js runtime for Next.js and the health endpoint
- Tailwind CSS 4 plus a custom responsive design system
- Motion for page and composer transitions
- React Konva direct-manipulation composition editor
- Office-scoped campaigns, templates, compositions, and image metadata in Neon
- Private Vercel Blob storage for unpublished photos and office templates
- Vercel Blob direct uploads for campaign videos
- Secure Meta OAuth plus Regional Administrator staff approval and office roles
- Encrypted Page-token storage in Vercel Marketplace Postgres
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
npm test
npm run build
```

## Deploy on Vercel

Import this repository in Vercel. The Next.js application is at the repository root, so no custom Root Directory or build command is required.

The current production URL is `https://socialmedia-dilg12.vercel.app/`.

### Secure multi-Page Facebook publishing

This is the recommended setup for Province, City, and Regional Office Pages. Each authorized staff member connects their Facebook account, sees the Pages they are allowed to manage, and selects the current publishing Page in **Settings → Facebook Pages**.

The connection variables configure one shared Region XII integration, not one Page. `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` identify the Meta app; `FACEBOOK_TOKEN_ENCRYPTION_KEY` protects stored Page tokens; and the Neon pooled database URL stores separate encrypted connections, staff approvals, offices, roles, and an access audit. Do not create Page-specific environment variables. After Meta verifies a staff account, a Regional Administrator must still approve it and bind it to an office before the studio becomes available.

1. Create or configure a Meta app with Facebook Login and the permissions `pages_show_list`, `pages_manage_posts`, and `pages_read_engagement`.
2. Add this exact production redirect URI in the Meta app: `https://socialmedia-dilg12.vercel.app/api/facebook/oauth/callback`.
3. In Vercel Marketplace, connect Neon so Vercel supplies `POSTGRES_URL` or `DATABASE_URL`. The application accepts either pooled variable.
4. Add the variables below in **Vercel → Project Settings → Environment Variables**, then redeploy.

```text
FACEBOOK_APP_ID
FACEBOOK_APP_SECRET
FACEBOOK_TOKEN_ENCRYPTION_KEY
DATABASE_URL or POSTGRES_URL
FACEBOOK_GRAPH_API_VERSION=v25.0
BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN
EDITOR_STORE_ID
EDITOR_WEBHOOK_PUBLIC_KEY
EDITOR_READ_WRITE_TOKEN
NEXT_PUBLIC_SITE_URL=https://socialmedia-dilg12.vercel.app
```

Generate `FACEBOOK_TOKEN_ENCRYPTION_KEY` as a long random secret and never paste it into browser settings. Page access tokens are encrypted with AES-256-GCM before they are stored. The browser receives only Page names, IDs, pictures, and an opaque HttpOnly session cookie. The app creates the access, connection, and office-workspace tables automatically; [the equivalent connection SQL schema](./db/facebook-connections.sql) is included for administrators and audits.

Meta may require App Review and Business Verification before people outside the app’s assigned roles can grant these permissions. A person can publish only when both Meta and the server-side Region XII staff directory authorize the same Page. Personal-profile posting is not supported by this Page integration.

Facebook establishes a stable staff identity and proves which Pages that identity can manage. New identities remain pending until a Regional Administrator assigns an office and one of the roles `office_admin`, `publisher`, `editor`, or `viewer`. The earliest existing valid connection deterministically bootstraps the Regional Administrator during the one-time migration so the deployment cannot lock out its owner or award administration based on refresh timing. Application sessions expire after 12 hours to reduce exposure on shared office computers. Every media, Feed, video, Story, and connection-test request verifies the signed-in session, approved staff status, active office membership, role, and office-to-Page binding before a Page token can be decrypted. The legacy single-Page token and publishing-key path has been removed.

### Staff approval and office privacy

Open **Settings → Staff and office administration** as a Regional Administrator. A newly signed-in employee appears as **Pending** with the Facebook Pages Meta verified for that identity. Select the official office, role, and matching Page, then approve the account. Employees cannot approve themselves, choose an unassigned office, or publish through a Page that is not bound to their membership. If one employee has duties in more than one office, each additional assignment must be added explicitly by a Regional Administrator. All access changes are written to `dilg_access_audit`.

The secure server workflow exports each composition, uploads each image as unpublished media, then creates one ordered multi-photo Page feed post. An optional cover is always attachment 1. The My Day source can be the cover or any event photo and is exported in a generated 1080 × 1920 layout. Video campaigns use one MP4, MOV, or WebM file and can publish to the Page Feed, My Day, or both.

### Cover pages and direct image editing

Every uploaded photo has non-destructive controls for pan, zoom, crop, 90-degree rotation, and reset. The React Konva editor lets staff select the image or plain text directly, then drag, resize, rotate, wrap, align, recolor, keyboard-nudge, undo, or redo. Office templates remain locked.

Campaign title, date, venue, subtitle, and custom text are independent normalized layers. Campaign title is linked live and has no automatic banner, stripe, or background. A layer can target the cover, every event photo, or one selected photo.

Enable **Add a cover page?** to use an event photo or a separate private image. Cover-only office templates can provide suggested text positions, while campaign users can override them. Cover effects include None, Cherry duotone, and deterministic Auto duotone.

### Enable private editor uploads

In Vercel, create a separate **Private Blob** store and connect it with the environment-variable prefix `EDITOR`. Vercel supplies `EDITOR_STORE_ID`, `EDITOR_WEBHOOK_PUBLIC_KEY`, and the sensitive `EDITOR_READ_WRITE_TOKEN`; then redeploy. The app also recognizes the older `EDITOR_BLOB_READ_WRITE_TOKEN` name for backward compatibility. This private store is intentionally separate from the public video store and from `FACEBOOK_TOKEN_ENCRYPTION_KEY`.

Private image URLs are never exposed as public assets. The app serves them through authenticated membership-checked asset routes. Viewers can read their office workspace, editors can modify campaigns, publishers can edit and publish, and office administrators can also manage reusable templates.

### Enable video uploads

In Vercel, open **Storage**, create a **Blob** store, choose **Public**, and connect it to this project for Production and Preview. Current Vercel projects use OIDC and expose `BLOB_STORE_ID`; older stores may expose `BLOB_READ_WRITE_TOKEN`. The application accepts both. Redeploy after connecting the store. Videos upload directly from the browser to Blob instead of passing through a Vercel Function, so files up to the composer’s 500 MB limit are supported.

Public Blob storage is intentional: Meta must be able to fetch the video URL during publishing. The Blob token remains server-only. The composer accepts one video per campaign, and a My Day video must be 60 seconds or shorter.

### Feed and My Day behavior

- Choose **Facebook Feed**, **My Day / Story**, or both in the campaign composer.
- Feed posts use the campaign caption. My Day does not include the caption.
- Photo My Day publishing uses the cover or event photo selected in the composer.
- My Day publishes immediately and remains visible on Facebook for 24 hours.
- Scheduled publishing is available for Feed-only campaigns. A campaign that includes My Day cannot be scheduled through this integration.

## Data model and security

Campaigns, templates, compositions, and image metadata are stored in the office-scoped Neon tables `dilg_campaigns`, `dilg_campaign_media`, and `dilg_templates`. Every read and write resolves the signed-in staff membership and office on the server. Revision checks prevent one employee from silently overwriting another employee’s edit; conflicting saves offer Reload or Save as copy.

Browser storage is retained only as a compatibility cache and one-time import source. The importer deduplicates legacy IDs and removes the old fixed event overlay only after the server import succeeds.

The app never stores or returns Meta Page access tokens in browser storage. Page tokens are encrypted in Postgres and decrypted only inside authenticated Next.js routes. Tokens and account session identifiers are not included in local backups or exports.
