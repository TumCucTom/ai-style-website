import { mapData } from "@/lib/map-data";

export const dynamic = "force-static";

export function GET() {
  return Response.json(mapData());
}
