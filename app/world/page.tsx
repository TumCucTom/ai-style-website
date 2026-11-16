import type { Metadata } from "next";
import f1 from "@/data/f1.json";
import { WorldTour } from "@/components/world/WorldTour";
import "./world.css";

export const metadata: Metadata = {
  title: "Tom Bale · world tour",
  description: "A globe with the places things happened. You can go inside a few and walk around.",
};

export default function Page() {
  return <WorldTour races={f1.races} />;
}
