import type { Metadata } from "next";
import { Builder } from "@/components/builder/Builder";
import { content } from "@/components/builder/content";
import "../builder.css";

export const metadata: Metadata = {
  title: "Tom Bale · the studio",
  description: "Get your own Claude to design Tom Bale's site, by copy and paste.",
};

// This route is served with a strict Content-Security-Policy (next.config.mjs):
// the browser will only let it talk to this site.
export default function Page() {
  return <Builder content={content()} studio />;
}
