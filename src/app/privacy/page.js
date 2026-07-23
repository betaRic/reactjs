const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://socialmedia-dilg12.vercel.app";

export const metadata = {
  title: "Privacy Policy | DILG Social Studio",
  description: "Privacy policy for DILG Social Studio.",
};

export default function PrivacyPage() {
  return (
    <main className="policy-shell">
      <article className="policy-card">
        <span className="policy-kicker">DILG Social Studio</span>
        <h1>Privacy Policy</h1>
        <p className="policy-updated">Last updated: July 23, 2026</p>

        <p>
          DILG Social Studio helps DILG offices in Region XII plan, design, and publish official
          social media content. This policy explains what information the app handles, how it is
          used, and how authorized offices can request deletion of their stored content.
        </p>

        <section>
          <h2>Information We Process</h2>
          <p>The app may process the following information for authorized office users:</p>
          <ul>
            <li>Facebook Page connection data needed to publish posts to an authorized Page.</li>
            <li>Campaign details such as titles, captions, dates, venues, subtitles, and templates.</li>
            <li>Uploaded images, cover media, and video assets used for post creation.</li>
            <li>Workspace records such as office membership, campaign drafts, and template settings.</li>
            <li>Basic technical logs needed to operate, secure, and troubleshoot the service.</li>
          </ul>
        </section>

        <section>
          <h2>How Information Is Used</h2>
          <ul>
            <li>To let authorized office staff create and manage campaign drafts.</li>
            <li>To render edited images, cover pages, and reusable templates.</li>
            <li>To publish approved content to connected Facebook Pages and My Day.</li>
            <li>To keep workspaces separated by office and reduce cross-office access.</li>
            <li>To maintain security, audit access, and improve service reliability.</li>
          </ul>
        </section>

        <section>
          <h2>Storage and Security</h2>
          <p>
            Facebook connection secrets and server-side publishing credentials are intended to stay on
            the server and are not exposed to ordinary browser storage. Campaign records, templates,
            and uploaded media may be stored in hosted database and object storage services used by the
            application.
          </p>
        </section>

        <section>
          <h2>Sharing</h2>
          <p>
            Information is used to operate the service and publish content to the Facebook Page chosen
            by an authorized office user. The app is not intended to make private office workspace data
            publicly visible except for content that a user intentionally publishes.
          </p>
        </section>

        <section>
          <h2>Data Retention</h2>
          <p>
            Drafts, templates, uploaded media, and connection records may be retained as long as they
            are needed for operational, records, or administrative purposes, or until an authorized
            deletion request is received.
          </p>
        </section>

        <section>
          <h2>Data Deletion Requests</h2>
          <p>
            To request deletion of workspace data associated with this app, use the data deletion
            instructions page:
          </p>
          <p>
            <a href={`${siteUrl}/data-deletion`}>{siteUrl}/data-deletion</a>
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy questions about this app or requests related to stored content, contact the
            office administrator responsible for the deployment or the managing DILG regional team.
          </p>
        </section>
      </article>
    </main>
  );
}
