import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

// The only font the site downloads. Body and data use system faces.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tom Bale",
  description:
    "Tom Bale is a product engineer at Anima, in London. This is his site. It comes in a few versions: one you describe yourself, a wind tunnel, a globe, a chess game, a paper and a CV.",
  metadataBase: new URL("https://thomasbale.com"),
  openGraph: {
    title: "Tom Bale",
    description: "Product engineer at Anima, in London. One site, a few versions.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090b0f" },
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
  ],
};

// Runs before paint. Night is the default; .light is the paper. A page shown in the
// home page's preview pane is marked .embedded, so it can drop its own chrome.
const themeInit = `(function(){try{var s=localStorage.getItem('theme');var p=s||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');if(p==='light')document.documentElement.classList.add('light')}catch(e){}try{if(self!==top)document.documentElement.classList.add('embedded')}catch(e){document.documentElement.classList.add('embedded')}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
