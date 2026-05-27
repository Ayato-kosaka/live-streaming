export const TOTAL_COUNT = 2292;
const DEFAULT_DONE = 1284;

const sheetId = "1APT9leIkCWbfgyHeZ9c0z8HaRtWG-woUCGbt214gNE8";
const sheetName = "Status";
const range = "B1";

const createUrl = () => {
  if (!sheetId) return null;

  return (
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq` +
    `?sheet=${encodeURIComponent(sheetName)}` +
    `&range=${encodeURIComponent(range)}` +
    `&tqx=out:json`
  );
};

const parseGvizValue = (text: string): number => {
  const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const data = JSON.parse(jsonText);
  const value = Number(data.table?.rows?.[0]?.c?.[0]?.v);
  if (Number.isNaN(value)) {
    throw new Error("progress value is not a number");
  }
  return value;
};

export async function fetchProgressCount(): Promise<number> {
  const url = createUrl();
  if (!url) {
    return DEFAULT_DONE;
  }

  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  return parseGvizValue(text);
}
