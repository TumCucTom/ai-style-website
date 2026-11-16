// /studio takes a reply pasted from someone's own chatbot. The policy below
// makes the browser refuse scripts, frames, form posts and data requests to
// any host but this one. Pictures, clips and fonts may load from the web,
// because a design is allowed to use them. Inline scripts
// stay allowed because Next's own bootstrap needs them.
const dev = process.env.NODE_ENV !== "production";
const studioCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  // a pasted design may bring pictures, clips and Google Fonts from the web
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self'${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/studio",
        headers: [
          { key: "Content-Security-Policy", value: studioCsp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
