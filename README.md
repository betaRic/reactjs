# DILG Social Studio

A separate Next.js rebuild of the NAS5 Facebook Poster workflow for DILG offices across Region XII. The original NAS application remains untouched in the parent folder.

## Stack

- Next.js 16 and React 19
- Node.js runtime for Next.js and the health endpoint
- Tailwind CSS 4 plus a custom responsive design system
- Motion for page and composer transitions
- Browser local storage partitioned by approved staff identity and assigned office Page
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
NEXT_PUBLIC_SITE_URL=https://socialmedia-dilg12.vercel.app
```

Generate `FACEBOOK_TOKEN_ENCRYPTION_KEY` as a long random secret and never paste it into browser settings. Page access tokens are encrypted with AES-256-GCM before they are stored. The browser receives only Page names, IDs, pictures, and an opaque HttpOnly session cookie. The app creates its two database tables automatically; [the equivalent SQL schema](./db/facebook-connections.sql) is included for administrators and audits.

Meta may require App Review and Business Verification before people outside the app’s assigned roles can grant these permissions. A person can publish only when both Meta and the server-side Region XII staff directory authorize the same Page. Personal-profile posting is not supported by this Page integration.

Facebook establishes a stable staff identity and proves which Pages that identity can manage. New identities remain pending until a Regional Administrator assigns an office and one of the roles `office_admin`, `publisher`, `editor`, or `viewer`. The earliest existing valid connection deterministically bootstraps the Regional Administrator during the one-time migration so the deployment cannot lock out its owner or award administration based on refresh timing. Application sessions expire after 12 hours to reduce exposure on shared office computers. Every media, Feed, video, Story, and connection-test request verifies the signed-in session, approved staff status, active office membership, role, and office-to-Page binding before a Page token can be decrypted. The legacy single-Page token and publishing-key path has been removed.

### Staff approval and office privacy

Open **Settings → Staff and office administration** as a Regional Administrator. A newly signed-in employee appears as **Pending** with the Facebook Pages Meta verified for that identity. Select the official office, role, and matching Page, then approve the account. Employees cannot approve themselves, choose an unassigned office, or publish through a Page that is not bound to their membership. If one employee has duties in more than one office, each additional assignment must be added explicitly by a Regional Administrator. All access changes are written to `dilg_access_audit`.

The secure server workflow prepares the selected template on every photo, uploads each photo as unpublished media, then creates one multi-photo Page feed post. A photo My Day/Story uses the first campaign photo in a generated 1080 × 1920 layout. Video campaigns use one MP4, MOV, or WebM file and can publish to the Page Feed, My Day, or both.

### Photo editing and event overlays

Every uploaded photo has non-destructive editing controls for zoom, horizontal and vertical crop position, 90-degree rotation, and reset. The photo editor and Facebook preview render the actual final composition in real time while keeping the selected brand template unchanged.

Photo campaigns can also enable a shared event-information banner. The event title, date, and location are applied consistently to every campaign photo. Use **Position directly on image** to drag the complete banner anywhere inside the composed template; arrow keys provide precise nudging. The selected coordinates apply to every photo without modifying the photo or template. When the event title is blank, the campaign title is used automatically.

### Enable video uploads

In Vercel, open **Storage**, create a **Blob** store, choose **Public**, and connect it to this project for Production and Preview. Current Vercel projects use OIDC and expose `BLOB_STORE_ID`; older stores may expose `BLOB_READ_WRITE_TOKEN`. The application accepts both. Redeploy after connecting the store. Videos upload directly from the browser to Blob instead of passing through a Vercel Function, so files up to the composer’s 500 MB limit are supported.

Public Blob storage is intentional: Meta must be able to fetch the video URL during publishing. The Blob token remains server-only. The composer accepts one video per campaign, and a My Day video must be 60 seconds or shorter.

### Feed and My Day behavior

- Choose **Facebook Feed**, **My Day / Story**, or both in the campaign composer.
- Feed posts use the campaign caption. My Day does not include the caption.
- Photo My Day publishing uses the first photo; rearrange photos to select it.
- My Day publishes immediately and remains visible on Facebook for 24 hours.
- Scheduled publishing is available for Feed-only campaigns. A campaign that includes My Day cannot be scheduled through this integration.

## Data model and security

Workspace records remain device-local but are partitioned under `dilg-social-studio:v1:{account}:{page}`. Switching accounts or Pages loads a separate campaign, template, settings, and activity workspace, preventing one office from seeing or overwriting another office’s local drafts on a shared device. The Settings page can export and restore the current Page workspace. Uploaded photos are resized and compressed before local storage; videos remain in Vercel Blob and the local campaign stores only their public URL and metadata.

The app never stores or returns Meta Page access tokens in browser storage. Page tokens are encrypted in Postgres and decrypted only inside authenticated Next.js routes. Tokens and account session identifiers are not included in local backups or exports.
