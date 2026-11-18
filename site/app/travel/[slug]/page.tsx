import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRAVEL_PLACES } from "@/content/travel";
import { CountryRecordPage, countryRecord, recordMetadata } from "../record";

/* 面を持つ国は名簿（`content/travel.ts`）から。いま歩いている旅の国は道が固定の面
   （`app/travel/<国>/page.tsx`）なので、ここには来ない。**中身の型はどちらも `../record.tsx` の1つ** */
export function generateStaticParams() {
  return TRAVEL_PLACES.filter((p) => p.country).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = countryRecord(slug);
  return r ? recordMetadata(r) : {};
}

export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = countryRecord(slug);
  if (!r) notFound();
  return <CountryRecordPage r={r} />;
}
