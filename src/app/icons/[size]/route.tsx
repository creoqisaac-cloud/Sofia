import { ImageResponse } from "next/og";

/** Íconos PWA generados (sin archivos binarios en el repo). */
export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  const px = size === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#09090b", color: "#34d399", fontSize: px * 0.6, fontWeight: 800 }}>
        S
      </div>
    ),
    { width: px, height: px },
  );
}
