import "./globals.css";

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (productionHost ? `https://${productionHost}` : "http://localhost:3000");

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: "DILG Social Studio",
  description: "A modern campaign planning and publishing workspace for DILG General Santos City.",
  openGraph: {
    title: "DILG Social Studio",
    description: "Plan, review, and publish community updates from one calm workspace.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "DILG Social Studio — Plan. Review. Publish." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DILG Social Studio",
    description: "Plan, review, and publish community updates from one calm workspace.",
    images: ["/og.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#11142d",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
