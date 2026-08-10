import { describe, expect, it, vi } from "vitest";
import { searchMemoLocations } from "../src/worker/location-service";

describe("memo location search", () => {
  it("maps valid Nominatim results and identifies the requesting site", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([
      {
        place_id: 123,
        display_name: "静安寺街道, 静安区, 上海市, 中国",
        lat: "31.223456",
        lon: "121.445678"
      }
    ]));

    await expect(
      searchMemoLocations(
        "上海静安寺",
        "https://blog.example.com",
        fetcher as typeof fetch
      )
    ).resolves.toEqual([
      {
        id: "123",
        displayName: "静安寺街道, 静安区, 上海市, 中国",
        latitude: 31.223456,
        longitude: 121.445678
      }
    ]);

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe(
      "https://nominatim.openstreetmap.org/search"
    );
    expect(url.searchParams.get("q")).toBe("上海静安寺");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(init.headers).toMatchObject({
      Referer: "https://blog.example.com",
      "User-Agent": "cf-blog/0.1 (+https://blog.example.com)"
    });
  });

  it("rejects malformed upstream responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: "bad" }));

    await expect(
      searchMemoLocations("静安寺", "https://blog.example.com", fetcher as typeof fetch)
    ).rejects.toMatchObject({
      status: 503,
      code: "LOCATION_SEARCH_INVALID"
    });
  });
});
