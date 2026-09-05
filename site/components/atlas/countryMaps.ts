/**
 * 国ごとの寄り地図。`python/build_world_route.py` が焼いたものをここで束ねる。
 *
 * 動的 import にすると、静的書き出しのときにどの国が要るか webpack が
 * 決められず、17カ国ぶんぜんぶを1つの塊にしてしまう。
 * ここで名前を書いておけば、使う国だけがそのページの HTML に入る。
 */
import france from "@/content/atlas/c/france.json";
import netherlands from "@/content/atlas/c/netherlands.json";
import belgium from "@/content/atlas/c/belgium.json";
import hungary from "@/content/atlas/c/hungary.json";
import austria from "@/content/atlas/c/austria.json";
import slovakia from "@/content/atlas/c/slovakia.json";
import czech from "@/content/atlas/c/czech.json";
import germany from "@/content/atlas/c/germany.json";
import uk from "@/content/atlas/c/uk.json";
import turkey from "@/content/atlas/c/turkey.json";
import cyprus from "@/content/atlas/c/cyprus.json";
import egypt from "@/content/atlas/c/egypt.json";
import jordan from "@/content/atlas/c/jordan.json";
import uae from "@/content/atlas/c/uae.json";
import azerbaijan from "@/content/atlas/c/azerbaijan.json";
import georgia from "@/content/atlas/c/georgia.json";
import armenia from "@/content/atlas/c/armenia.json";
import iranBorder from "@/content/atlas/c/iran-border.json";

export type CountryMapData = {
  view: { w: number; h: number };
  land: string;
  countries: Record<string, string>;
  lakes: string;
  rivers: string;
  grid: string;
  ridges: string;
  peaks: number[][];
  woods: number[][];
  dunes: number[][];
  glints: number[][];
  cities: { id: string; name: string; x: number; y: number; country: string; kind: string }[];
  legs: { from: string; to: string; move: string; d: string }[];
  scale: { km: number; len: number };
};

export const COUNTRY_MAPS: Record<string, CountryMapData> = {
  france,
  netherlands,
  belgium,
  hungary,
  austria,
  slovakia,
  czech,
  germany,
  uk,
  turkey,
  cyprus,
  egypt,
  jordan,
  uae,
  azerbaijan,
  georgia,
  armenia,
  "iran-border": iranBorder,
} as unknown as Record<string, CountryMapData>;
