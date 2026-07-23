export const metadata = {
  title: "Data Deletion Instructions | DILG Social Studio",
  description: "Data deletion instructions for DILG Social Studio.",
};

export default function DataDeletionPage() {
  return (
    <main className="policy-shell">
      <article className="policy-card">
        <span className="policy-kicker">DILG Social Studio</span>
        <h1>Data Deletion Instructions</h1>
        <p className="policy-updated">Last updated: July 23, 2026</p>

        <p>
          Authorized users may request deletion of workspace data connected to this app. This includes
          campaign drafts, templates, uploaded images, and stored Facebook Page connection records that
          belong to their office workspace.
        </p>

        <section>
          <h2>How to Request Deletion</h2>
          <ol>
            <li>Identify the office workspace and Facebook Page involved.</li>
            <li>Contact the office administrator or the managing DILG regional team for this deployment.</li>
            <li>Provide enough detail to locate the data, such as campaign title, approximate upload date, or Page name.</li>
            <li>Ask for deletion of the specific draft, asset, template, or connection record.</li>
          </ol>
        </section>

        <section>
          <h2>Disconnecting Facebook Access</h2>
          <p>
            Users can also remove this app from their Facebook-connected apps in Facebook account
            settings. Removing the app from Facebook stops future access, but office workspace records
            stored by this service may still require a deletion request to the app administrator.
          </p>
        </section>

        <section>
          <h2>Processing</h2>
          <p>
            Deletion requests should be reviewed by an authorized administrator for the affected office
            workspace. Records that are no longer required for operations, security, or administrative
            purposes should then be removed from the service.
          </p>
        </section>
      </article>
    </main>
  );
}
