import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { appRedirect, publicOrigin, sameSiteForm } from "../src/server/auth/public-origin";
import { POST as login } from "../src/app/acceso/route";
import { proxy } from "../src/proxy";

afterEach(() => vi.unstubAllEnvs());

function safariRequest(form = {user:"mario", password:"clave-de-prueba", next:"/iphone"}) {
  const data = new URLSearchParams(form);
  return new NextRequest("http://localhost:10000/acceso", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://sofia-app-6qo6.onrender.com",
      "sec-fetch-site": "same-origin",
    },
    body: data.toString(),
  });
}

describe("Login de Safari detrás del proxy HTTPS de Render", () => {
  it("compara con el dominio externo y no localhost:10000", () => {
    vi.stubEnv("SOFIA_PUBLIC_ORIGIN", "https://sofia-app-6qo6.onrender.com");
    const req = safariRequest();
    expect(req.nextUrl.host).toBe("localhost:10000");
    expect(publicOrigin(req)).toBe("https://sofia-app-6qo6.onrender.com");
    expect(sameSiteForm(req)).toBe(true);
    expect(appRedirect(req, "/iphone").href).toBe("https://sofia-app-6qo6.onrender.com/iphone");
  });

  it("bloquea formularios ajenos (CSRF)", () => {
    vi.stubEnv("SOFIA_PUBLIC_ORIGIN", "https://sofia-app-6qo6.onrender.com");
    const foreign = new NextRequest("http://localhost:10000/acceso", {
      method: "POST",
      headers: { origin:"https://otro-dominio.example", "sec-fetch-site":"cross-site" },
    });
    expect(sameSiteForm(foreign)).toBe(false);
  });

  it("acepta las credenciales, crea cookie segura y permite entrar a iPhone", async () => {
    vi.stubEnv("SOFIA_PUBLIC_ORIGIN", "https://sofia-app-6qo6.onrender.com");
    vi.stubEnv("SOFIA_BASIC_AUTH", "mario:clave-de-prueba");
    vi.stubEnv("SOFIA_SECRET_KEY", "secreto-del-servidor-largo-y-de-prueba");
    const res = await login(safariRequest());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://sofia-app-6qo6.onrender.com/iphone");
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("__Host-sofia_session=");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    const token=cookie!.match(/__Host-sofia_session=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    const next = new NextRequest("https://sofia-app-6qo6.onrender.com/iphone", {
      headers: { cookie:`__Host-sofia_session=${token}` }
    });
    expect(proxy(next).status).toBe(200);
  });

  it("muestra error por credenciales equivocadas, no Solicitud no autorizada", async () => {
    vi.stubEnv("SOFIA_PUBLIC_ORIGIN", "https://sofia-app-6qo6.onrender.com");
    vi.stubEnv("SOFIA_BASIC_AUTH", "mario:otra-clave");
    vi.stubEnv("SOFIA_SECRET_KEY", "secreto-del-servidor-largo-y-de-prueba");
    const res = await login(safariRequest());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Usuario o contraseña incorrectos");
  });
});
