import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** Chave por academia derivada do segredo global: vazar a chave de uma não compromete as outras. */
export const tenantKey = (tenantId: string) => {
  if (!process.env.ACCESS_JWT_SECRET) throw new Error("ACCESS_JWT_SECRET ausente");
  return createHmac("sha256", process.env.ACCESS_JWT_SECRET).update(tenantId).digest();
};
const sign = (data: string, tenantId: string) => createHmac("sha256", tenantKey(tenantId)).update(data).digest("base64url");

export function signAccessToken(userId: string, tenantId: string, ttl = 60) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: userId, tid: tenantId, jti: randomUUID(), iat: now, exp: now + ttl })}`;
  return `${body}.${sign(body, tenantId)}`;
}

export function verifyAccessToken(token: string, tenantId: string):
  { ok: true; sub: string; jti: string } | { ok: false; reason: "INVALID" | "EXPIRED" } {
  const p = typeof token === "string" ? token.split(".") : [];
  if (p.length !== 3) return { ok: false, reason: "INVALID" };
  const good = Buffer.from(sign(`${p[0]}.${p[1]}`, tenantId)), got = Buffer.from(p[2]);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return { ok: false, reason: "INVALID" };
  try {
    const c = JSON.parse(Buffer.from(p[1], "base64url").toString());
    if (c.tid !== tenantId || !c.sub || !c.jti) return { ok: false, reason: "INVALID" };
    if (c.exp <= Math.floor(Date.now() / 1000)) return { ok: false, reason: "EXPIRED" };
    return { ok: true, sub: c.sub, jti: c.jti };
  } catch { return { ok: false, reason: "INVALID" }; }
}
