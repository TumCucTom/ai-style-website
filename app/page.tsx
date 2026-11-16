import type { Metadata } from "next";
import { Builder } from "@/components/builder/Builder";
import { content } from "@/components/builder/content";
import "./builder.css";

export const metadata: Metadata = {
  title: "Tom Bale",
  description: "Tom Bale, product engineer at Anima. Describe a version of my website and it gets built in front of you, or open one of the five I made.",
};

export default function Page() {
  return <Builder content={content()} />;
}
