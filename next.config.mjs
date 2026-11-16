// /studio takes a reply pasted from someone's own chatbot. The policy below
// makes the browser refuse to send anything from that page to any host but
// this one, and refuse outside scripts, frames and form posts. Inline scripts
// stay allowed because Next's own bootstrap needs them.
const dev = process.env.NODE_ENV !== "production";
const studioCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
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
