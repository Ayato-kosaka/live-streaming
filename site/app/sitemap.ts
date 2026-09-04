import type { MetadataRoute } from "next";
import { COUNTRIES } from "@/content/countries";
import { RECIPES } from "@/content/recipes";
import { APPS } from "@/content/apps";
import { LEGENDS } from "@/content/legends";
import { STREAM_TYPES } from "@/content/streamTypes";
import { SITE } from "@/content/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const url = (p: string) => `${SITE.url}${p}`;
  const top = ["", "/streams", "/map", "/kitchen", "/apps", "/legends", "/now", "/next", "/board", "/friends"];
  return [
    ...top.map((p) => ({ url: url(p), lastModified: now, priority: p === "" ? 1 : 0.8 })),
    ...STREAM_TYPES.map((t) => ({ url: url(`/streams/${t.slug}`), lastModified: now, priority: 0.7 })),
    ...COUNTRIES.map((c) => ({ url: url(`/map/${c.slug}`), lastModified: now, priority: 0.6 })),
    ...RECIPES.map((r) => ({ url: url(`/kitchen/${r.slug}`), lastModified: now, priority: 0.6 })),
    ...APPS.map((a) => ({ url: url(`/apps/${a.slug}`), lastModified: now, priority: 0.6 })),
    ...LEGENDS.map((l) => ({ url: url(`/legends/${l.slug}`), lastModified: now, priority: 0.6 })),
  ];
}
