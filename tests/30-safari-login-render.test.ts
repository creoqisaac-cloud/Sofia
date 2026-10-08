import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { appRedirect, publicOrigin } from "../src/server/auth/public-origin";
import { GET as loginPage, POST as login } from "../src/app/acceso/route";
import { proxy } from "../src/proxy";

const HOST = "https://sofia-app-6qo6.onrender.com";
const SECRET = "secreto-del-servidor-largo-y-de-prueba";
afterEach(() => vi.unstubAllEnvs());

function setup(password = "clave-de-prueba") {
  vi.stubEnv("SOFIA_PUBLIC_ORIGIN", HOST);
  vi.stubEnv("SOFIA_BASIC_AUTH", "mario:" + password);
  vi.stubEnv("SOFIA_SECRET_KEY", SECRET);
}

async function loginForm() {
  const page = await loginPage(new NextRequest(HOST + "/acceso?next=%2Fiphone"));
  expect(page.status).toBe(200);
  const html = await page.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  const cookie = page.headers.get("set-cookie")?.match(/__Host-sofia_login_csrf=([^;]+)/)?.[1];
  expect(csrf).toBeTruthy();
  expect(cookie).toBe(csrf);
  return { csrf: csrf!, cookie: cookie! };
}

function safariRequest(csrf?: string, cookie?: string, password = "clave-de-prueba", origin = "null") {
  const data = new URLSearchParams({user:"mario",password,next:"/iphone",csrf:csrf??""});
  return new NextRequest("http://localhost:10000/acceso", {
    method:"POST",
    headers: {
      "content-type":"application/x-www-form-urlencoded",
      "origin":origin,
      "sec-fetch-site":"same-origin",
      ...(cookie ? {cookie: "__Host-sofia_login_csrf=" + cookie} : {}),
    },
    body:data.toString(),
  });
}

describe("Safari: inicio seguro detrás de Render", () => {
  it("usa el dominio HTTPS externo para las redirecciones", () => {
    setup();
    const req = safariRequest();
    expect(req.nextUrl.host).toBe("localhost:10000");
    expect(publicOrigin(req)).toBe(HOST);
    expect(appRedirect(req,"/iphone").href).toBe(HOST+"/iphone");
  });

  it("rechaza solicitudes de otro sitio sin token ligado a cookie", async () => {
    setup();
    const res = await login(safariRequest());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Safari no pudo verificar este formulario");
    expect(res.headers.get("set-cookie")).toContain("__Host-sofia_login_csrf=");
  });

  it("permite login con cookies firmadas aun con Origin null y host interno", async () => {
    setup();
    const {csrf,cookie} = await loginForm();
    const res = await login(safariRequest(csrf,cookie));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(HOST+"/iphone");
    const sessionCookie = res.headers.get("set-cookie");
    expect(sessionCookie).toContain("__Host-sofia_session=");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("HttpOnly");
    const token=sessionCookie!.match(/__Host-sofia_session=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    const next = new NextRequest(HOST + "/iphone", {headers:{cookie:"__Host-sofia_session="+token}});
    expect(proxy(next).status).toBe(200);
  });

  it("ante una contraseña errónea indica error en vez de responder 403", async () => {
    setup("otra-clave");
    const {csrf,cookie}=await loginForm();
    const res = await login(safariRequest(csrf,cookie));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Usuario o contraseña incorrectos");
  });

  it("rechaza tokens alterados aunque el usuario y contraseña sean válidos",async () => {
    setup();
    const {csrf,cookie}=await loginForm();
    const fake=csrf.slice(0,-1)+(csrf.endsWith("a")?"b":"a");
    const res=await login(safariRequest(fake,cookie));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Safari no pudo verificar este formulario");
  });
});
