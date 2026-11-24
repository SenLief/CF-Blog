import type { APIRoute } from "astro";
import { PUBLIC_MEMOS_PATH } from "@cf-blog/contracts";

export const GET: APIRoute = ({ url, redirect }) =>
  redirect(`${PUBLIC_MEMOS_PATH}${url.search}`, 308);

export const HEAD = GET;
