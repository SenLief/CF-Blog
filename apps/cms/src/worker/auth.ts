import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { AppError } from "./http";

type AppContext = {
  Bindings: Env;
  Variables: {
    requestId: string;
    userEmail: string;
  };
};

function isLocalRequest(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export const requireAccess: MiddlewareHandler<AppContext> = async (c, next) => {
  const url = new URL(c.req.url);
  if (`${c.env.ENVIRONMENT}` === "development" && isLocalRequest(url)) {
    c.set("userEmail", "local@cf-blog.dev");
    await next();
    return;
  }

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) {
    throw new AppError(401, "ACCESS_REQUIRED", "需要通过 Cloudflare Access 登录");
  }

  try {
    const issuer = c.env.ACCESS_TEAM_DOMAIN.replace(/\/+$/, "");
    const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const result = await jwtVerify(token, jwks, {
      issuer,
      audience: c.env.ACCESS_AUD
    });
    const actor =
      typeof result.payload.email === "string"
        ? result.payload.email
        : typeof result.payload.common_name === "string"
          ? result.payload.common_name
          : "access-user";
    c.set("userEmail", actor);
    await next();
  } catch {
    throw new AppError(401, "INVALID_ACCESS_TOKEN", "Access 身份验证失败");
  }
};

export const requireSameOrigin: MiddlewareHandler<AppContext> = async (c, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    await next();
    return;
  }

  const origin = c.req.header("Origin");
  const requestUrl = new URL(c.req.url);
  let originUrl: URL | null = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }
  const isLocalDevelopmentOrigin =
    `${c.env.ENVIRONMENT}` === "development" &&
    isLocalRequest(requestUrl) &&
    originUrl !== null &&
    isLocalRequest(originUrl);
  if (
    !origin ||
    (origin !== requestUrl.origin && !isLocalDevelopmentOrigin)
  ) {
    throw new AppError(403, "INVALID_ORIGIN", "请求来源无效");
  }
  await next();
};
