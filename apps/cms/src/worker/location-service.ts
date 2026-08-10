import type { MemoLocationSearchResult } from "@cf-blog/contracts";
import { z } from "zod";
import { AppError } from "./http";

const nominatimSearchResultSchema = z.array(
  z.object({
    place_id: z.union([z.number(), z.string()]),
    display_name: z.string().min(1),
    lat: z.string(),
    lon: z.string()
  })
);

export async function searchMemoLocations(
  query: string,
  blogUrl: string,
  fetcher: typeof fetch = fetch
): Promise<MemoLocationSearchResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "5",
    addressdetails: "0",
    "accept-language": "zh-CN,zh,en"
  }).toString();

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        Referer: blogUrl,
        "User-Agent": `cf-blog/0.1 (+${blogUrl})`
      },
      cf: { cacheEverything: true, cacheTtl: 86_400 }
    });
  } catch {
    throw new AppError(503, "LOCATION_SEARCH_UNAVAILABLE", "位置搜索暂时不可用");
  }
  if (!response.ok) {
    throw new AppError(503, "LOCATION_SEARCH_UNAVAILABLE", "位置搜索暂时不可用");
  }

  const payload = await response.json<unknown>().catch(() => null);
  const parsed = nominatimSearchResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(503, "LOCATION_SEARCH_INVALID", "位置搜索返回了无效结果");
  }
  return parsed.data.flatMap((item) => {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return [];
    }
    return [{
      id: String(item.place_id),
      displayName: item.display_name,
      latitude,
      longitude
    }];
  });
}
