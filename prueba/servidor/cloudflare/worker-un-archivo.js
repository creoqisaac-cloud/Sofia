// Archivo único para pegar en el editor de Cloudflare (Workers → Edit code). GENERADO desde worker.mjs + core.mjs.
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn2, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn2 && (res = (0, fn2[__getOwnPropNames(fn2)[0]])(fn2 = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// prueba/vendor/anthropic-sdk.mjs
var anthropic_sdk_exports = {};
__export(anthropic_sdk_exports, {
  default: () => $a,
  jsonSchemaOutputFormat: () => Fu
});
function he(r) {
  return typeof r == "object" && r !== null && ("name" in r && r.name === "AbortError" || "message" in r && String(r.message).includes("FetchRequestCanceledException"));
}
function De(r) {
  return new Proxy({}, { get(s, e) {
    if (typeof e != "symbol") throw new y(`\`${r}.${e}\` is not available in this environment; it needs a Node.js-compatible runtime`);
  } });
}
function ua(r, s) {
  if (!(r >= Wn)) throw new y(`${s} must be at least ${Wn}ms (got ${r}); to run without memory sync, pass \`memorySyncIntervalMs: null\` to the worker instead`);
}
function H(r) {
  throw new y(`${r} requires Node.js or a Node-compatible runtime`);
}
function gl(r) {
  return H("setupSkills");
}
function wl(r, s) {
  return H("extractSkillArchive");
}
function bl(r) {
  return H("betaAgentToolset20260401");
}
function yl(r, s) {
  return H("resolvePath");
}
function kl(r) {
  return H("betaBashTool");
}
function Sl(r) {
  return H("betaReadTool");
}
function xl(r) {
  return H("betaWriteTool");
}
function vl(r) {
  return H("betaEditTool");
}
function Al(r) {
  return H("betaGlobTool");
}
function Rl(r) {
  return H("betaGrepTool");
}
function _(r, s, e, t, n) {
  if (t === "m") throw new TypeError("Private method is not writable");
  if (t === "a" && !n) throw new TypeError("Private accessor was defined without a setter");
  if (typeof s == "function" ? r !== s || !n : !s.has(r)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return t === "a" ? n.call(r, e) : n ? n.value = e : s.set(r, e), e;
}
function a(r, s, e, t) {
  if (e === "a" && !t) throw new TypeError("Private accessor was defined without a getter");
  if (typeof s == "function" ? r !== s || !t : !s.has(r)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return e === "m" ? t : e === "a" ? t.call(r) : t ? t.value : s.get(r);
}
function cr(r) {
  return typeof r != "object" ? {} : r ?? {};
}
function Rs(r) {
  if (!r) return true;
  for (let s in r) return false;
  return true;
}
function Wi(r, s) {
  return Object.prototype.hasOwnProperty.call(r, s);
}
function Es(r) {
  return r != null && typeof r == "object" && !Array.isArray(r);
}
function Ka() {
  return typeof Deno < "u" && Deno.build != null ? "deno" : typeof EdgeRuntime < "u" ? "edge" : Object.prototype.toString.call(typeof globalThis.process < "u" ? globalThis.process : 0) === "[object process]" ? "node" : "unknown";
}
function Ja() {
  if (typeof navigator > "u" || !navigator) return null;
  let r = [{ key: "edge", pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ }, { key: "ie", pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ }, { key: "ie", pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ }, { key: "chrome", pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ }, { key: "firefox", pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ }, { key: "safari", pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ }];
  for (let { key: s, pattern: e } of r) {
    let t = e.exec(navigator.userAgent);
    if (t) {
      let n = t[1] || 0, i = t[2] || 0, o = t[3] || 0;
      return { browser: s, version: `${n}.${i}.${o}` };
    }
  }
  return null;
}
function Ya(r, s) {
  return () => r.removeEventListener("abort", s);
}
function Vi(r, s, e) {
  Zr.set(r, Ya(s, e));
}
function Ji(r, s) {
  Zr.has(s) && Ki?.register(r, s, s);
}
function _e(r) {
  let s = Zr.get(r);
  s && (Zr.delete(r), Ki?.unregister(r), s());
}
function Yi() {
  if (typeof fetch < "u") return fetch;
  throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new Anthropic({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
}
function Ps(...r) {
  let s = globalThis.ReadableStream;
  if (typeof s > "u") throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
  return new s(...r);
}
function en(r) {
  let s = Symbol.asyncIterator in r ? r[Symbol.asyncIterator]() : r[Symbol.iterator]();
  return Ps({ start() {
  }, async pull(e) {
    let { done: t, value: n } = await s.next();
    t ? e.close() : e.enqueue(n);
  }, async cancel() {
    await s.return?.();
  } });
}
function ur(r) {
  if (r[Symbol.asyncIterator]) return r;
  let s = r.getReader();
  return { async next() {
    try {
      let e = await s.read();
      return e?.done && s.releaseLock(), e;
    } catch (e) {
      throw s.releaseLock(), e;
    }
  }, async return() {
    let e = s.cancel();
    return s.releaseLock(), await e, { done: true, value: void 0 };
  }, [Symbol.asyncIterator]() {
    return this;
  } };
}
async function Gi(r) {
  if (r === null || typeof r != "object") return;
  if (r[Symbol.asyncIterator]) {
    await r[Symbol.asyncIterator]().return?.();
    return;
  }
  let s = r.getReader(), e = s.cancel();
  s.releaseLock(), await e;
}
function eo(r) {
  return !r || typeof r != "object" ? false : !!(r.constructor && r.constructor.isBuffer && r.constructor.isBuffer(r));
}
function Cs(r, s) {
  if (Y(r)) {
    let e = [];
    for (let t = 0; t < r.length; t += 1) e.push(s(r[t]));
    return e;
  }
  return s(r);
}
function Qa(r) {
  return typeof r == "string" || typeof r == "number" || typeof r == "boolean" || typeof r == "symbol" || typeof r == "bigint";
}
function so(r, s, e, t, n, i, o, c, d, u, p, f, m, b, g, x, A, E) {
  let k = r, I = E, v = 0, R = false;
  for (; (I = I.get($s)) !== void 0 && !R; ) {
    let W = I.get(r);
    if (v += 1, typeof W < "u") {
      if (W === v) throw new RangeError("Cyclic object value");
      R = true;
    }
    typeof I.get($s) > "u" && (v = 0);
  }
  if (typeof u == "function" ? k = u(s, k) : k instanceof Date ? k = m?.(k) : e === "comma" && Y(k) && (k = Cs(k, function(W) {
    return W instanceof Date ? m?.(W) : W;
  })), k === null) {
    if (i) return d && !x ? d(s, K.encoder, A, "key", b) : s;
    k = "";
  }
  if (Qa(k) || eo(k)) {
    if (d) {
      let W = x ? s : d(s, K.encoder, A, "key", b);
      return [g?.(W) + "=" + g?.(d(k, K.encoder, A, "value", b))];
    }
    return [g?.(s) + "=" + g?.(String(k))];
  }
  let $ = [];
  if (typeof k > "u") return $;
  let M;
  if (e === "comma" && Y(k)) x && d && (k = Cs(k, d)), M = [{ value: k.length > 0 ? k.join(",") || null : void 0 }];
  else if (Y(u)) M = u;
  else {
    let W = Object.keys(k);
    M = p ? W.sort(p) : W;
  }
  let N = c ? String(s).replace(/\./g, "%2E") : String(s), F = t && Y(k) && k.length === 1 ? N + "[]" : N;
  if (n && Y(k) && k.length === 0) return F + "[]";
  for (let W = 0; W < M.length; ++W) {
    let oe = M[W], Le = typeof oe == "object" && typeof oe.value < "u" ? oe.value : k[oe];
    if (o && Le === null) continue;
    let xs = f && c ? oe.replace(/\./g, "%2E") : oe, La = Y(k) ? typeof e == "function" ? e(F, xs) : F : F + (f ? "." + xs : "[" + xs + "]");
    E.set(r, v);
    let Hi = /* @__PURE__ */ new WeakMap();
    Hi.set($s, E), no($, so(Le, La, e, t, n, i, o, c, e === "comma" && x && Y(k) ? null : d, u, p, f, m, b, g, x, A, Hi));
  }
  return $;
}
function Za(r = K) {
  if (typeof r.allowEmptyArrays < "u" && typeof r.allowEmptyArrays != "boolean") throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
  if (typeof r.encodeDotInKeys < "u" && typeof r.encodeDotInKeys != "boolean") throw new TypeError("`encodeDotInKeys` option can only be `true` or `false`, when provided");
  if (r.encoder !== null && typeof r.encoder < "u" && typeof r.encoder != "function") throw new TypeError("Encoder has to be a function.");
  let s = r.charset || K.charset;
  if (typeof r.charset < "u" && r.charset !== "utf-8" && r.charset !== "iso-8859-1") throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
  let e = Is;
  if (typeof r.format < "u") {
    if (!tn(Ms, r.format)) throw new TypeError("Unknown format option provided.");
    e = r.format;
  }
  let t = Ms[e], n = K.filter;
  (typeof r.filter == "function" || Y(r.filter)) && (n = r.filter);
  let i;
  if (r.arrayFormat && r.arrayFormat in ro ? i = r.arrayFormat : "indices" in r ? i = r.indices ? "indices" : "repeat" : i = K.arrayFormat, "commaRoundTrip" in r && typeof r.commaRoundTrip != "boolean") throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
  let o = typeof r.allowDots > "u" ? r.encodeDotInKeys ? true : K.allowDots : !!r.allowDots;
  return { addQueryPrefix: typeof r.addQueryPrefix == "boolean" ? r.addQueryPrefix : K.addQueryPrefix, allowDots: o, allowEmptyArrays: typeof r.allowEmptyArrays == "boolean" ? !!r.allowEmptyArrays : K.allowEmptyArrays, arrayFormat: i, charset: s, charsetSentinel: typeof r.charsetSentinel == "boolean" ? r.charsetSentinel : K.charsetSentinel, commaRoundTrip: !!r.commaRoundTrip, delimiter: typeof r.delimiter > "u" ? K.delimiter : r.delimiter, encode: typeof r.encode == "boolean" ? r.encode : K.encode, encodeDotInKeys: typeof r.encodeDotInKeys == "boolean" ? r.encodeDotInKeys : K.encodeDotInKeys, encoder: typeof r.encoder == "function" ? r.encoder : K.encoder, encodeValuesOnly: typeof r.encodeValuesOnly == "boolean" ? r.encodeValuesOnly : K.encodeValuesOnly, filter: n, format: e, formatter: t, serializeDate: typeof r.serializeDate == "function" ? r.serializeDate : K.serializeDate, skipNulls: typeof r.skipNulls == "boolean" ? r.skipNulls : K.skipNulls, sort: typeof r.sort == "function" ? r.sort : null, strictNullHandling: typeof r.strictNullHandling == "boolean" ? r.strictNullHandling : K.strictNullHandling };
}
function io(r, s = {}) {
  let e = r, t = Za(s), n, i;
  typeof t.filter == "function" ? (i = t.filter, e = i("", e)) : Y(t.filter) && (i = t.filter, n = i);
  let o = [];
  if (typeof e != "object" || e === null) return "";
  let c = ro[t.arrayFormat], d = c === "comma" && t.commaRoundTrip;
  n || (n = Object.keys(e)), t.sort && n.sort(t.sort);
  let u = /* @__PURE__ */ new WeakMap();
  for (let m = 0; m < n.length; ++m) {
    let b = n[m];
    t.skipNulls && e[b] === null || no(o, so(e[b], b, c, d, t.allowEmptyArrays, t.strictNullHandling, t.skipNulls, t.encodeDotInKeys, t.encode ? t.encoder : null, t.filter, t.sort, t.allowDots, t.serializeDate, t.format, t.formatter, t.encodeValuesOnly, t.charset, u));
  }
  let p = o.join(t.delimiter), f = t.addQueryPrefix === true ? "?" : "";
  return t.charsetSentinel && (t.charset === "iso-8859-1" ? f += "utf8=%26%2310003%3B&" : f += "utf8=%E2%9C%93&"), p.length > 0 ? f + p : "";
}
function oo(r) {
  return io(r, { arrayFormat: "brackets" });
}
function nn(r) {
  if (!r) return;
  let s;
  try {
    s = new URL(r);
  } catch (t) {
    throw new O(`Invalid token endpoint base URL "${r}": ${t}`);
  }
  if (s.protocol === "https:") return;
  let e = s.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!(s.protocol === "http:" && (e === "localhost" || e === "127.0.0.1" || e === "::1"))) throw new O(`Refusing to send credential over non-https token endpoint "${r}"`);
}
async function sn(r, s) {
  let e = await lc(r), t;
  try {
    t = JSON.parse(e);
  } catch {
    throw new O(`Token endpoint returned non-JSON response (status ${r.status})`, r.status, Q(e), s);
  }
  if (!t.access_token) throw new O(`Token endpoint response missing access_token: ${JSON.stringify(Q(t))}`, r.status, Q(t), s);
  if (t.token_type && t.token_type.toLowerCase() !== "bearer") throw new O(`Token endpoint response: unsupported token_type "${t.token_type}" (want Bearer)`, r.status, Q(t), s);
  return t;
}
function Q(r) {
  if (r == null) return r;
  if (typeof r == "string") {
    let s;
    try {
      s = JSON.parse(r);
    } catch {
      return r.length <= Ns ? r : r.slice(0, Ns) + `... <${r.length - Ns} more chars>`;
    }
    return JSON.stringify(Q(s));
  }
  if (typeof r == "object" && !Array.isArray(r)) {
    let s = {};
    for (let [e, t] of Object.entries(r)) cc.has(e) && (s[e] = t);
    return s;
  }
  return null;
}
async function on(r, s = (e) => console.warn(`anthropic-sdk: ${e}`)) {
  if (typeof process > "u" || process.platform === "win32") return;
  let { fs: e } = await Promise.resolve().then(() => (be(), we)), t = r, n;
  try {
    t = await e.promises.realpath(r), n = await e.promises.stat(t);
  } catch {
    return;
  }
  let i = n.mode & 511;
  if (i & 18) throw new O(`Credentials file at ${t} is group/world-writable (mode 0o${i.toString(8)}); this allows other local users to plant tokens. Run \`chmod 600 ${t}\`.`);
  if (i & 36) throw new O(`Credentials file at ${t} is group/world-readable (mode 0o${i.toString(8)}); run \`chmod 600 ${t}\` before retrying.`);
  typeof process.getuid == "function" && n.uid !== process.getuid() && s(`credentials file at ${t} is owned by uid ${n.uid} (current process uid ${process.getuid()}); verify this is intentional.`);
}
async function an(r, s) {
  let { fs: e, path: t } = await Promise.resolve().then(() => (be(), we)), n = t.dirname(r);
  await e.promises.mkdir(n, { recursive: true, mode: 448 });
  let i = `${r}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    let o = await e.promises.open(i, "w", 384);
    try {
      await o.writeFile(JSON.stringify(s, null, 2)), await o.sync();
    } finally {
      await o.close();
    }
    await e.promises.rename(i, r);
  } catch (o) {
    throw await e.promises.unlink(i).catch(() => {
    }), o;
  }
  try {
    let o = await e.promises.open(n, "r");
    try {
      await o.sync();
    } finally {
      await o.close();
    }
  } catch {
  }
}
async function lc(r) {
  if (!r.body) return "";
  let s = r.body.getReader(), e = [], t = 0;
  for (; ; ) {
    let { done: i, value: o } = await s.read();
    if (i) break;
    if (t + o.length > ao) {
      let c = ao - t;
      c > 0 && e.push(o.subarray(0, c)), await s.cancel();
      break;
    }
    e.push(o), t += o.length;
  }
  let n;
  if (e.length === 1) n = e[0];
  else {
    n = new Uint8Array(e.reduce((o, c) => o + c.length, 0));
    let i = 0;
    for (let o of e) n.set(o, i), i += o.length;
  }
  return new TextDecoder("utf-8").decode(n);
}
function pe() {
  return Math.floor(Date.now() / 1e3);
}
function _o(r) {
  let s = 0;
  for (let n of r) s += n.length;
  let e = new Uint8Array(s), t = 0;
  for (let n of r) e.set(n, t), t += n.length;
  return e;
}
function dr(r) {
  let s;
  return (po ?? (s = new globalThis.TextEncoder(), po = s.encode.bind(s)))(r);
}
function hr(r) {
  let s;
  return (mo ?? (s = new globalThis.TextDecoder(), mo = s.decode.bind(s)))(r);
}
function rt() {
}
function ln(r, s, e) {
  return !s || un[r] > un[e] ? rt : s[r].bind(s);
}
function Fs(r, s) {
  let e = wo.get(r);
  if (e && e[0] === s) return e[1];
  let t = { error: ln("error", r, s), warn: ln("warn", r, s), info: ln("info", r, s), debug: ln("debug", r, s) };
  return wo.set(r, [s, t]), t;
}
function T(r) {
  let s = r.logger, e = r.logLevel ?? "off";
  return s ? Fs(s, e) : uc;
}
function yo() {
  let r = P("ANTHROPIC_LOG");
  return (!Ls || r !== bo) && (bo = r, Ls = Fs(console, dn(r, "process.env['ANTHROPIC_LOG']", Fs(console, fr)) ?? fr)), Ls;
}
function ye(r, s, e) {
  r.debug !== rt && r.debug(s, dc(e));
}
function ko(r) {
  if (!r) throw new Error("profile name is empty");
  if (r === "." || r === "..") throw new Error(`profile name "${r}" is not allowed`);
  if (r.includes("/") || r.includes("\\")) throw new Error(`profile name "${r}" must not contain path separators`);
  if (!hc.test(r)) throw new Error(`profile name "${r}" contains disallowed characters (allowed: letters, digits, '_', '.', '-')`);
}
function Ds(r) {
  if (!r) throw new y("Identity token file path is empty");
  return async () => {
    let { fs: s } = await Promise.resolve().then(() => (be(), we)), e;
    try {
      e = await s.promises.readFile(r, "utf-8");
    } catch (n) {
      throw new y(`Failed to read identity token file at ${r}: ${n}`);
    }
    let t = e.trim();
    if (!t) throw new y(`Identity token file at ${r} is empty`);
    return t;
  };
}
function Ao(r) {
  if (!r) throw new y("Identity token value is empty");
  return () => r;
}
function Ro(r) {
  return async () => {
    nn(r.baseURL);
    let s = await r.identityTokenProvider();
    if (s.length > 16 * 1024) throw new O(`Identity token is ${Math.ceil(s.length / 1024)} KiB, exceeds the 16 KiB assertion limit`);
    let e = { grant_type: co, assertion: s, federation_rule_id: r.federationRuleId, organization_id: r.organizationId };
    r.serviceAccountId && (e.service_account_id = r.serviceAccountId), r.workspaceId && (e.workspace_id = r.workspaceId);
    let t = `${r.baseURL}${rn}`, n;
    try {
      n = await r.fetch(t, { method: "POST", headers: { "Content-Type": "application/json", "anthropic-beta": `${Be},${uo}`, "User-Agent": r.userAgent || `anthropic-sdk-typescript/${ae} oidcFederationProvider` }, body: JSON.stringify(e) });
    } catch (d) {
      throw new O(`Failed to reach token endpoint ${t}: ${d}`);
    }
    let i = n.headers.get("Request-Id");
    if (!n.ok) {
      let d = await n.text().catch(() => ""), u = Q(d), p = "";
      throw n.status === 401 && (p = ` Ensure your federation rule matches your identity token. ${r.workspaceId ? "" : "If your federation rule is scoped to multiple workspaces, set the ANTHROPIC_WORKSPACE_ID environment variable, the 'workspace_id' config key, or the `workspaceId` option. "}View your authentication events in the Workload identity page of Claude Console for more details.`), new O(`Token exchange failed with status ${n.status}${i ? ` (request-id ${i})` : ""}: ${u}${p}`, n.status, u, i);
    }
    let o = await sn(n, i), c = Number(o.expires_in);
    if (!Number.isFinite(c)) throw new O(`Token endpoint response missing required fields: ${JSON.stringify(Q(o))}`, n.status, Q(o), i);
    return { token: o.access_token, expiresAt: pe() + c };
  };
}
function Eo(r) {
  return async (s) => {
    let { fs: e } = await Promise.resolve().then(() => (be(), we));
    await on(r.credentialsPath, r.onSafetyWarning);
    let t;
    try {
      t = await e.promises.readFile(r.credentialsPath, "utf-8");
    } catch (A) {
      throw new O(`Credentials file not found at ${r.credentialsPath}: ${A}`);
    }
    let n;
    try {
      n = JSON.parse(t);
    } catch (A) {
      throw new O(`Credentials file at ${r.credentialsPath} is not valid JSON: ${A}`);
    }
    let i = n.access_token;
    if (!i) throw new O(`Credentials file at ${r.credentialsPath} must include 'access_token'`);
    let o = n.expires_at;
    if (!s?.forceRefresh && (o == null || pe() < o - tt)) return { token: i, expiresAt: o ?? null };
    let c = n.refresh_token;
    if (!r.clientId || !c) throw new O(`Access token at ${r.credentialsPath} has expired and no refresh is available (client_id ${r.clientId ? "set" : "empty"}, refresh_token ${c ? "set" : "empty"})`);
    nn(r.baseURL);
    let d = { grant_type: lo, refresh_token: c, client_id: r.clientId }, u = `${r.baseURL}${rn}`, p;
    try {
      p = await r.fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "anthropic-beta": Be, "User-Agent": r.userAgent || `anthropic-sdk-typescript/${ae} userOAuthProvider` }, body: JSON.stringify(d) });
    } catch (A) {
      throw new O(`User OAuth refresh failed to reach token endpoint: ${A}`);
    }
    let f = p.headers.get("Request-Id");
    if (!p.ok) {
      let A = await p.text().catch(() => "");
      throw new O(`User OAuth refresh failed (HTTP ${p.status}): ${Q(A)}`, p.status, Q(A), f);
    }
    let m = await sn(p, f), b = Number(m.expires_in);
    if (!Number.isFinite(b)) throw new O(`User OAuth refresh response missing or invalid expires_in: ${JSON.stringify(Q(m))}`, p.status, Q(m), f);
    let g = pe() + b, x = m.refresh_token || c;
    return await an(r.credentialsPath, { ...n, version: fn, type: "oauth_token", access_token: m.access_token, expires_at: g, refresh_token: x }), { token: m.access_token, expiresAt: g };
  };
}
function Bs(r, s) {
  let e = r.authentication.credentials_path ?? null, t = (r.base_url || s.baseURL).replace(/\/+$/, ""), n = pc(r, e, t, s), i = {};
  return r.workspace_id && r.authentication.type === "user_oauth" && (i["anthropic-workspace-id"] = r.workspace_id), { provider: n, extraHeaders: i, baseURL: r.base_url || void 0 };
}
async function Po(r, s) {
  let e = await So(s);
  if (!e) return null;
  let { config: t, fromFile: n } = e, i = t.authentication.credentials_path || !n ? t : { ...t, authentication: { ...t.authentication, credentials_path: await xo(t, s) ?? void 0 } };
  return Bs(i, r);
}
function pc(r, s, e, t) {
  switch (r.authentication.type) {
    case "oidc_federation": {
      let n = r.authentication, i = mc(n);
      if (!i) throw new O("oidc_federation config requires an identity token (set authentication.identity_token, ANTHROPIC_IDENTITY_TOKEN_FILE, or ANTHROPIC_IDENTITY_TOKEN)");
      if (!n.federation_rule_id) throw new O("oidc_federation config requires 'federation_rule_id'. Set it in authentication.federation_rule_id in your profile, or via ANTHROPIC_FEDERATION_RULE_ID (profile takes precedence).");
      if (!r.organization_id) throw new O("oidc_federation config requires organization_id (set ANTHROPIC_ORGANIZATION_ID or config.organization_id)");
      let o = Ro({ identityTokenProvider: i, federationRuleId: n.federation_rule_id, organizationId: r.organization_id, serviceAccountId: n.service_account_id, workspaceId: r.workspace_id, baseURL: e, fetch: t.fetch, userAgent: t.userAgent });
      return s ? _c(o, s, t.onCacheWriteError, t.onSafetyWarning) : o;
    }
    case "user_oauth": {
      if (!s) throw new O("user_oauth config requires authentication.credentials_path (or load via a profile so it defaults to <config_dir>/credentials/<profile>.json)");
      return Eo({ credentialsPath: s, clientId: r.authentication.client_id, baseURL: e, fetch: t.fetch, userAgent: t.userAgent, onSafetyWarning: t.onSafetyWarning });
    }
    default: {
      let n = r.authentication.type;
      throw new O(`authentication.type "${n}" is not a known authentication type`);
    }
  }
}
function mc(r) {
  if (r.identity_token) {
    let t = r.identity_token.source;
    if (t !== "file") throw new O(`identity_token.source "${t}" is not supported by this SDK version (only "file")`);
    if (!r.identity_token.path) throw new O('identity_token.source "file" requires a non-empty path');
    return Ds(r.identity_token.path);
  }
  let s = P("ANTHROPIC_IDENTITY_TOKEN_FILE");
  if (s) return Ds(s);
  let e = P("ANTHROPIC_IDENTITY_TOKEN");
  return e ? Ao(e) : null;
}
function _c(r, s, e, t) {
  return async (n) => {
    let { fs: i } = await Promise.resolve().then(() => (be(), we));
    await on(s, t);
    let o;
    try {
      let d = await i.promises.readFile(s, "utf-8");
      o = JSON.parse(d);
      let u = o?.access_token;
      if (u && !n?.forceRefresh) {
        let p = o?.expires_at;
        if (p == null || pe() < p - tt) return { token: u, expiresAt: p ?? null };
      }
    } catch (d) {
      d?.code !== "ENOENT" && !(d instanceof SyntaxError) && e?.(d);
    }
    let c = await r(n);
    try {
      await an(s, { ...o ?? {}, version: fn, type: "oauth_token", access_token: c.token, expires_at: c.expiresAt });
    } catch (d) {
      e?.(d);
    }
    return c;
  };
}
function gc(r, s) {
  for (let n = s ?? 0; n < r.length; n++) {
    if (r[n] === 10) return { preceding: n, index: n + 1, carriage: false };
    if (r[n] === 13) return { preceding: n, index: n + 1, carriage: true };
  }
  return null;
}
function Io(r) {
  for (let t = 0; t < r.length - 1; t++) {
    if (r[t] === 10 && r[t + 1] === 10 || r[t] === 13 && r[t + 1] === 13) return t + 2;
    if (r[t] === 13 && r[t + 1] === 10 && t + 3 < r.length && r[t + 2] === 13 && r[t + 3] === 10) return t + 4;
  }
  return -1;
}
async function* To(r, s) {
  if (!r.body) throw s.abort(), typeof globalThis.navigator < "u" && globalThis.navigator.product === "ReactNative" ? new y("The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api") : new y("Attempted to iterate over a response with no body");
  let e = new Ws(), t = new pr(), n = ur(r.body);
  for await (let i of wc(n)) for (let o of t.decode(i)) {
    let c = e.decode(o);
    c && (yield c);
  }
  for (let i of t.flush()) {
    let o = e.decode(i);
    o && (yield o);
  }
}
async function* wc(r) {
  let s = new Uint8Array();
  for await (let e of r) {
    if (e == null) continue;
    let t = e instanceof ArrayBuffer ? new Uint8Array(e) : typeof e == "string" ? dr(e) : e, n = new Uint8Array(s.length + t.length);
    n.set(s), n.set(t, s.length), s = n;
    let i;
    for (; (i = Io(s)) !== -1; ) yield s.subarray(0, i), s = s.subarray(i);
  }
  s.length > 0 && (yield s);
}
function bc(r, s) {
  let e = r.indexOf(s);
  return e !== -1 ? [r.substring(0, e), s, r.substring(e + s.length)] : [r, "", ""];
}
async function pn(r, s) {
  let { response: e, requestLogID: t, retryOfRequestLogID: n, startTime: i } = s, o = await (async () => {
    if (s.options.stream) return T(r).debug("response", e.status, e.url, e.headers, e.body), ke.fromSSEResponse(e, s.controller, r);
    if (e.status === 204) return null;
    if (s.options.__binaryResponse) return e;
    let d = e.headers.get("content-type")?.split(";")[0]?.trim();
    if (d?.includes("application/json") || d?.endsWith("+json")) {
      if (e.headers.get("content-length") === "0") return;
      let m = await e.json();
      return _r(m, e);
    }
    return await e.text();
  })().finally(() => {
    !s.options.stream && !s.options.__binaryResponse && _e(s.controller);
  });
  return ye(T(r), `[${t}] response parsed`, { retryOfRequestLogID: n, url: e.url, status: e.status, body: o, durationMs: Date.now() - i }), o;
}
function _r(r, s) {
  return !r || typeof r != "object" || Array.isArray(r) ? r : Object.defineProperties(r, { _request_id: { value: s.headers.get("request-id"), enumerable: false }, _workspace_id: { value: s.headers.get("anthropic-workspace-id"), enumerable: false } });
}
function Us(r) {
  return typeof r == "object" && r !== null && Oo.has(r);
}
function Co(r) {
  let s = /* @__PURE__ */ new Set();
  for (; typeof r == "object" && r !== null && !s.has(r); ) {
    if (s.add(r), Us(r) || he(r) || r instanceof Ae || r instanceof Gr) return true;
    r = r.cause;
  }
  return false;
}
function qs(r, s, e, t) {
  return async (n, i = {}) => {
    if (s.length === 0) return r.call(void 0, n, i);
    let o = i.headers instanceof Headers ? i.headers : new Headers(i.headers), c = await kc(r, s, e, t)({ ...i, headers: o, url: typeof n == "string" ? n : n instanceof URL ? n.href : n.url });
    if (c.bodyUsed || c.body?.locked) throw new y("middleware consumed the response body; use response.clone() to inspect it, or return new Response(body, response) to consume and replace it");
    return c;
  };
}
function yc(r, s) {
  let e = /* @__PURE__ */ new WeakMap();
  return { options: r, logger: s ? T(s) : yo(), parse(t) {
    if (r?.stream && t.ok) return Mo(t, r, s);
    let n = e.get(t);
    return n || (n = Mo(t, r, s), e.set(t, n)), n;
  } };
}
async function Mo(r, s, e) {
  if (r.bodyUsed || r.body?.locked) throw new y("cannot ctx.parse() a response whose body was already consumed; call ctx.parse() instead of reading the body, or read via response.clone()");
  if (s?.stream && r.ok) return ke.fromSSEResponse(r.clone(), new AbortController(), e);
  if (r.status === 204) return null;
  if (s?.__binaryResponse) return r;
  let n = r.headers.get("content-type")?.split(";")[0]?.trim();
  return n?.includes("application/json") || n?.endsWith("+json") ? r.headers.get("content-length") === "0" ? void 0 : _r(await r.clone().json(), r) : await r.clone().text();
}
function kc(r, s, e, t) {
  let n = async ({ url: o, ...c }) => {
    try {
      return await r.call(void 0, o, c);
    } catch (d) {
      let u = Fe(d);
      throw Oo.add(u), u;
    }
  }, i = yc(e, t);
  for (let o = s.length - 1; o >= 0; o--) {
    let c = s[o], d = n;
    n = async (u) => c(u, d, i);
  }
  return n;
}
function We(r, s, e) {
  return Ks(), new File(r, s ?? "unknown_file", e);
}
function wr(r, s) {
  let e = typeof r == "object" && r !== null && ("name" in r && r.name && String(r.name) || "url" in r && r.url && String(r.url) || "filename" in r && r.filename && String(r.filename) || "path" in r && r.path && String(r.path)) || "";
  return s ? e.split(/[\\/]/).pop() || void 0 : e;
}
function xc(r) {
  let s = typeof r == "function" ? r : r.fetch, e = No.get(s);
  if (e) return e;
  let t = (async () => {
    try {
      let n = "Response" in s ? s.Response : (await s("data:,")).constructor, i = new FormData();
      return i.toString() !== await new n(i).text();
    } catch {
      return true;
    }
  })();
  return No.set(s, t), t;
}
async function Ys(r, s, e) {
  if (Ks(), r = await r, s || (s = wr(r, true)), Ac(r)) return r instanceof File && s == null && e == null ? r : We([await r.arrayBuffer()], s ?? r.name, { type: r.type, lastModified: r.lastModified, ...e });
  if (Rc(r)) {
    let n = await r.blob();
    return s || (s = new URL(r.url).pathname.split(/[\\/]/).pop()), We(await Js(n), s, e);
  }
  let t = await Js(r);
  if (!e?.type) {
    let n = t.find((i) => typeof i == "object" && "type" in i && i.type);
    typeof n == "string" && (e = { ...e, type: n });
  }
  return We(t, s, e);
}
async function Js(r) {
  let s = [];
  if (typeof r == "string" || ArrayBuffer.isView(r) || r instanceof ArrayBuffer) s.push(r);
  else if (Lo(r)) s.push(r instanceof Blob ? r : await r.arrayBuffer());
  else if (Vs(r)) for await (let e of r) s.push(...await Js(e));
  else {
    let e = r?.constructor?.name;
    throw new Error(`Unexpected data type: ${typeof r}${e ? `; constructor: ${e}` : ""}${Ec(r)}`);
  }
  return s;
}
function Ec(r) {
  return typeof r != "object" || r === null ? "" : `; props: [${Object.getOwnPropertyNames(r).map((e) => `"${e}"`).join(", ")}]`;
}
function* Ic(r) {
  if (!r) return;
  if (Fo in r) {
    let { values: t, nulls: n } = r;
    yield* t.entries();
    for (let i of n) yield [i, null];
    return;
  }
  let s = false, e;
  r instanceof Headers ? e = r.entries() : As(r) ? e = r : (s = true, e = Object.entries(r ?? {}));
  for (let t of e) {
    let n = t[0];
    if (typeof n != "string") throw new TypeError("expected header name to be a string");
    let i = As(t[1]) ? t[1] : [t[1]], o = false;
    for (let c of i) c !== void 0 && (s && !o && (o = true, yield [n, wn]), yield [n, c]);
  }
}
function Do(r) {
  return r.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}
function yr(r) {
  return { [Ue]: r };
}
function br(r) {
  return typeof r == "object" && r !== null && ot in r;
}
function Gs(r, s) {
  let e = /* @__PURE__ */ new Set();
  if (r) for (let t of r) br(t) && e.add(t[ot]);
  if (s) for (let t of s) {
    br(t) && e.add(t[ot]);
    let n = t.content;
    if (Array.isArray(n)) for (let i of n) {
      br(i) && e.add(i[ot]);
      let o = i?.tool?.definition;
      br(o) && e.add(o[ot]);
    }
  }
  return Array.from(e);
}
function yn(r, s) {
  let e = Gs(r, s);
  return e.length === 0 ? {} : { [Ue]: e.join(", ") };
}
function kn(r) {
  return br(r) ? { [Ue]: r[ot] } : {};
}
function Pe(r, s) {
  if (!r) return () => {
  };
  if (r.aborted) return s.abort(), () => {
  };
  let e = () => s.abort();
  return r.addEventListener("abort", e), () => r.removeEventListener("abort", e);
}
function Ie(r, s) {
  return r instanceof D && r.status === s;
}
function Gc(r) {
  return r instanceof D && typeof r.status == "number" && r.status >= 400 && r.status < 500;
}
function qe(r) {
  return Gc(r) && !Ie(r, 408) && !Ie(r, 409) && !Ie(r, 429);
}
function An(r, s, e) {
  return Math.min(s * 2 ** r, e);
}
function Xo(r, s) {
  return r + Math.random() * (s - r);
}
function Rn(r) {
  return r * (1 - Math.random() * 0.25);
}
function En(r, { authToken: s, helper: e }) {
  if (!s) throw new y(`copyClientForHelper: expected a non-empty authToken but received ${JSON.stringify(s)}`);
  let t = r, n = t._options.defaultHeaders, i = t._authState?.extraHeaders, o = i ? Object.fromEntries(Object.entries(i).filter(([d]) => {
    let u = d.toLowerCase();
    return u !== "authorization" && u !== "x-api-key";
  })) : void 0, c = l([o, n, { [Ue]: e }]);
  return r.withOptions({ apiKey: null, authToken: s, baseURL: r.baseURL, credentials: void 0, defaultHeaders: c });
}
function tl(r) {
  return An(r, Qc, Zc);
}
function nl() {
  let s = globalThis.process?.env?.HOSTNAME;
  return s ? `${s}-${hn()}` : hn();
}
function ei(r) {
  return "name" in r ? r.name : "mcp_server_name" in r ? r.mcp_server_name : r.type;
}
function sl(r) {
  return r instanceof bt ? r.content : `Error: ${r instanceof Error ? r.message : String(r)}`;
}
async function Zo(r, s, e) {
  try {
    let t = r.parse ? r.parse(s) : s;
    return { content: await r.run(t, e), isError: false };
  } catch (t) {
    return { content: sl(t), isError: true };
  }
}
function ca(r) {
  return r.type === "session.status_idle" && r.stop_reason?.type === "end_turn";
}
function fl(r, s, e) {
  return r.type === "agent.custom_tool_use" ? { type: "user.custom_tool_result", custom_tool_use_id: r.id, is_error: s, content: e } : { type: "user.tool_result", tool_use_id: r.id, is_error: s, content: e };
}
function pl(r) {
  if (typeof r == "string") return [{ type: "text", text: r || "(no output)" }];
  let s = r.map((e) => e.type === "text" ? { type: "text", text: e.text || "(no output)" } : e.type === "image" || e.type === "document" ? e : e.type === "search_result" ? { type: "search_result", source: e.source, title: e.title, content: e.content.map((t) => ({ type: "text", text: t.text })), citations: { enabled: e.citations?.enabled ?? false } } : { type: "text", text: JSON.stringify(e) });
  return s.length > 0 ? s : [{ type: "text", text: "(no output)" }];
}
function Il(r) {
  return r.resources.some((s) => s.type === "memory_store");
}
function Tl(r) {
  if (!r) return null;
  let s;
  try {
    let t = r.replace(/-/g, "+").replace(/_/g, "/"), n = t.padEnd(Math.ceil(t.length / 4) * 4, "=");
    s = JSON.parse(hr(go(n)));
  } catch {
    return null;
  }
  if (s === null || typeof s != "object" || Array.isArray(s)) return null;
  let e = s.sessions_token;
  return typeof e == "string" && e !== "" ? e : null;
}
async function pa(r, s) {
  let e;
  try {
    return await Promise.race([r.then(() => false, () => false), new Promise((t) => {
      e = setTimeout(() => t(true), s);
    })]);
  } finally {
    e !== void 0 && clearTimeout(e);
  }
}
async function Ml(r, s, e, t) {
  try {
    await r.beta.environments.work.stop(s.id, { environment_id: s.environment_id, force: true }, { ...t, headers: l([t?.headers]) });
  } catch (n) {
    Ie(n, 409) || e.error("force-stop on exit failed", { work_id: s.id, error: String(n) });
  }
}
function Cl(r) {
  let s = r instanceof D ? r.error : void 0;
  for (let e of ["error", "details", "current_state"]) {
    if (!Es(s)) return {};
    s = s[e];
  }
  return Es(s) ? s : {};
}
async function $l(r, s, e, t, n, i) {
  let o = fa, c = El, d = Date.now(), u = Pl, p = async () => {
    let f = new AbortController(), m = Pe(e.signal, f), b = setTimeout(() => f.abort(), o);
    try {
      let g = await r.beta.environments.work.heartbeat(s.id, { environment_id: s.environment_id, expected_last_heartbeat: u }, { ...n, headers: l([n?.headers]), signal: f.signal });
      d = Date.now(), u = g.last_heartbeat, g.ttl_seconds > 0 && (c = g.ttl_seconds * 1e3, o = Math.max(1e3, Math.min(c / 2, fa)), i?.(c)), (g.state === "stopping" || g.state === "stopped") && (t.info("heartbeat signals shutdown", { work_id: s.id, state: g.state }), e.finish("control_plane_stop")), g.lease_extended || (t.warn("lease not extended, shutting down", { work_id: s.id }), e.finish("control_plane_stop"));
    } catch (g) {
      if (e.signal.throwIfAborted(), Ie(g, 412)) {
        let x = Cl(g);
        t.error("lease lost: heartbeat precondition failed", { work_id: s.id, server_state: x.state, server_ttl_seconds: x.ttl_seconds, server_last_heartbeat: x.last_heartbeat }), e.finish("lease_lost");
        return;
      }
      if (qe(g)) throw t.error("permanent heartbeat failure", { work_id: s.id, error: String(g) }), e.finish("heartbeat_rejected"), g;
      if (Date.now() - d > c) {
        t.error("lease assumed lost: no successful heartbeat in ttl", { work_id: s.id, ttl_ms: c, error: String(g) }), e.finish("assumed_lost");
        return;
      }
      t.warn("transient heartbeat failure", { work_id: s.id, error: String(g) });
    } finally {
      clearTimeout(b), m();
    }
  };
  for (await p(); !e.signal.aborted; ) await fe(o, e.signal), e.signal.throwIfAborted(), await p();
}
function ma(r) {
  return r?.output_format ?? r?.output_config?.format;
}
function ui(r, s, e) {
  let t = ma(s);
  return !s || !("parse" in (t ?? {})) ? { ...r, content: r.content.map((n) => {
    if (n.type === "text") {
      let i = Object.defineProperty({ ...n }, "parsed_output", { value: null, enumerable: false });
      return Object.defineProperty(i, "parsed", { get() {
        return e.logger.warn("The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead."), null;
      }, enumerable: false });
    }
    return n;
  }), parsed_output: null } : di(r, s, e);
}
function di(r, s, e) {
  let t = null, n = r.content.map((i) => {
    if (i.type === "text") {
      let o = Wl(s, i.text);
      t === null && (t = o);
      let c = Object.defineProperty({ ...i }, "parsed_output", { value: o, enumerable: false });
      return Object.defineProperty(c, "parsed", { get() {
        return e.logger.warn("The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead."), o;
      }, enumerable: false });
    }
    return i;
  });
  return { ...r, content: n, parsed_output: t };
}
function Wl(r, s) {
  let e = ma(r);
  if (e?.type !== "json_schema") return null;
  try {
    return "parse" in e ? e.parse(s) : JSON.parse(s);
  } catch (t) {
    throw new y(`Failed to parse structured output: ${t}`);
  }
}
function Jn(r, s) {
  let e = {};
  for (let i of Object.keys(r)) i !== "input" && (e[i] = r[i]);
  Object.defineProperty(e, Oe, { value: s, enumerable: false, writable: true });
  let t, n = false;
  return Object.defineProperty(e, "input", { enumerable: true, configurable: true, get() {
    return n || (t = s ? _a(s) : {}, n = true), t;
  } }), e;
}
function gi(r) {
  return r.type === "tool_use" || r.type === "server_tool_use" || r.type === "mcp_tool_use";
}
function wi() {
  let r, s;
  return { promise: new Promise((t, n) => {
    r = t, s = n;
  }), resolve: r, reject: s };
}
function xa(r) {
  if ("compaction" in r && r.compaction != null) throw new y("`compaction` cannot be set on a tool runner: every request in the loop would compact again. Call `runner.compactBeforeNextTurn()` when the conversation should be compacted instead.");
}
function Ri(r) {
  if (r.context_management?.edits?.some((s) => s.type.startsWith("compact_"))) throw new y("`compactBeforeNextTurn()` can't be used while `context_management` has a compaction edit, because the API doesn't accept a compaction block together with one. Remove the edit first.");
}
function Kl(r) {
  let { context_management: s, stop_sequences: e, output_format: t, ...n } = r, i = ({ format: o, ...c }) => c;
  return (n.tool_choice?.type === "any" || n.tool_choice?.type === "tool") && delete n.tool_choice, n.output_config && (n.output_config = i(n.output_config)), Array.isArray(n.fallbacks) && (n.fallbacks = n.fallbacks.map((o) => o.output_config ? { ...o, output_config: i(o.output_config) } : o)), n;
}
async function Vl(r, s, e, t) {
  if (!e || e.role !== "assistant" || !e.content || typeof e.content == "string") return null;
  let n = e.content.filter((o) => o.type === "tool_use");
  return n.length === 0 ? null : { role: "user", content: await Promise.all(n.map(async (o) => {
    let c = s.has(o.name) ? r.get(o.name) : void 0;
    if (!c) return Jl(o);
    try {
      let d = o.input;
      "parse" in c && c.parse && (d = c.parse(d));
      let u = await c.run(d, { toolUse: o, toolUseBlock: o, signal: t?.signal });
      return { type: "tool_result", tool_use_id: o.id, content: u };
    } catch (d) {
      return { type: "tool_result", tool_use_id: o.id, content: d instanceof bt ? d.content : `Error: ${d instanceof Error ? d.message : String(d)}`, is_error: true };
    }
  })) };
}
function Jl(r) {
  return { type: "tool_result", tool_use_id: r.id, content: `Error: Tool '${r.name}' not found`, is_error: true };
}
function va(r, s) {
  switch (r.type) {
    case "tool_removal":
    case "tool_addition":
      Yl(r, s);
      break;
  }
}
function Yl(r, s) {
  let e = Gl(r.tool);
  e !== void 0 && (r.type === "tool_removal" ? s.delete(e) : s.add(e));
}
function Gl(r) {
  switch (r.type) {
    case "tool_reference":
      return r.name;
    case "tool_definition":
      return "name" in r.definition ? r.definition.name : void 0;
    default:
      return;
  }
}
function Aa(r) {
  if (r === null) return "stop";
  switch (r) {
    case "tool_use":
      return "run_tools";
    case "pause_turn":
    case "compaction":
      return "resume";
    case "end_turn":
    case "stop_sequence":
    case "max_tokens":
    case "model_context_window_exceeded":
    case "refusal":
      return "stop";
    default:
      return "stop";
  }
}
function Ea(r) {
  if (!r.output_format) return r;
  if (r.output_config?.format) throw new y("Both output_format and output_config.format were provided. Please use only output_config.format (output_format is deprecated).");
  let { output_format: s, ...e } = r;
  return { ...e, output_config: { ...r.output_config, format: s } };
}
function Pa(r) {
  return r?.output_config?.format;
}
function Pi(r, s, e) {
  let t = Pa(s);
  return !s || !("parse" in (t ?? {})) ? { ...r, content: r.content.map((n) => n.type === "text" ? Object.defineProperty({ ...n }, "parsed_output", { value: null, enumerable: false }) : n), parsed_output: null } : Ii(r, s, e);
}
function Ii(r, s, e) {
  let t = null, n = r.content.map((i) => {
    if (i.type === "text") {
      let o = Eu(s, i.text);
      return t === null && (t = o), Object.defineProperty({ ...i }, "parsed_output", { value: o, enumerable: false });
    }
    return i;
  });
  return { ...r, content: n, parsed_output: t };
}
function Eu(r, s) {
  let e = Pa(r);
  if (e?.type !== "json_schema") return null;
  try {
    return "parse" in e ? e.parse(s) : JSON.parse(s);
  } catch (t) {
    throw new y(`Failed to parse structured output: ${t}`);
  }
}
function Ni(r) {
  return r.type === "tool_use" || r.type === "server_tool_use";
}
function Lu(r) {
  return JSON.parse(JSON.stringify(r));
}
function Na(r) {
  let s = Lu(r);
  return et(s);
}
function et(r) {
  let s = {}, e = X(r, "$defs");
  if (e !== void 0) {
    let p = {};
    s.$defs = p;
    for (let [f, m] of Object.entries(e)) p[f] = et(m);
  }
  let t = X(r, "$ref");
  if (t !== void 0) return s.$ref = t, s;
  let n = X(r, "type"), i = X(r, "anyOf"), o = X(r, "oneOf"), c = X(r, "allOf");
  if (Array.isArray(i)) s.anyOf = i.map((p) => et(p));
  else if (Array.isArray(o)) s.anyOf = o.map((p) => et(p));
  else if (Array.isArray(c)) s.allOf = c.map((p) => et(p));
  else {
    if (n === void 0) throw new Error("JSON schema must have a type defined if anyOf/oneOf/allOf are not used");
    s.type = n;
  }
  let d = X(r, "description");
  d !== void 0 && (s.description = d);
  let u = X(r, "title");
  if (u !== void 0 && (s.title = u), n === "object") {
    let p = X(r, "properties") || {};
    s.properties = Object.fromEntries(Object.entries(p).map(([m, b]) => [m, et(b)])), X(r, "additionalProperties"), s.additionalProperties = false;
    let f = X(r, "required");
    f !== void 0 && (s.required = f);
  } else if (n === "string") {
    let p = X(r, "format");
    p !== void 0 && Nu.has(p) ? s.format = p : p !== void 0 && (r.format = p);
  } else if (n === "array") {
    let p = X(r, "items");
    p !== void 0 && (s.items = et(p));
    let f = X(r, "minItems");
    f !== void 0 && (f === 0 || f === 1) ? s.minItems = f : f !== void 0 && (r.minItems = f);
  }
  if (Object.keys(r).length > 0) {
    let p = s.description;
    s.description = (p ? p + `

` : "") + "{" + Object.entries(r).map(([f, m]) => `${f}: ${JSON.stringify(m)}`).join(", ") + "}";
  }
  return s;
}
function Fu(r, s) {
  if (r.type !== "object") throw new Error(`JSON schema must be an object, but got ${r.type}`);
  return (s?.transform ?? true) && (r = Na(r)), { type: "json_schema", schema: { ...r }, parse: (t) => {
    try {
      return JSON.parse(t);
    } catch (n) {
      throw new y(`Failed to parse structured output: ${n instanceof Error ? n.message : String(n)}`);
    }
  } };
}
var Fa, vs, Ha, Da, Ba, Wa, Qt, Yr, Di, Ua, qa, Fe, He, y, D, J, Ae, Zt, Gr, er, tr, rr, nr, sr, ir, or, ar, L, we, tc, rc, nc, sc, ic, oc, ac, be, Uo, jo, Ko, Yo, la, Wn, ni, da, ml, _l, si, ii, oi, ai, ha, za, Bi, Y, As, Xr, Qr, X, fe, ae, zi, Va, Ui, qi, ji, lr, Zr, Ki, Xi, Is, Ts, Ms, Qi, tn, ge, Os, Zi, ro, no, to, K, $s, co, lo, rn, Be, uo, ho, tt, fo, ao, Ns, cc, O, cn, P, po, mo, go, fr, un, dn, uc, wo, bo, Ls, dc, hn, fn, hc, So, xo, Hs, fc, vo, te, re, pr, mr, ke, Ws, Oo, gr, mn, _n, js, $o, q, S, gn, Ks, Vs, ce, No, vc, zs, Lo, Ac, Rc, w, Fo, wn, Tc, Mc, l, Ho, Oc, h, nt, st, it, Ue, bn, ot, at, ct, lt, Go, dt, ht, vn, ft, Pn, le, In, Tn, Mn, Sr, xr, pt, mt, On, _t, vr, Xc, Qc, Zc, el, Ar, rl, gt, Te, wt, Qo, bt, Rr, Cn, yt, je, me, B, $n, V, Nn, Er, Dn, z, St, se, xt, Me, kt, Re, Bn, Pr, ue, Ln, oa, ea, ta, ra, ti, na, Fn, Hn, ri, sa, aa, ia, il, ol, al, cl, ll, ul, dl, hl, Ir, Un, Tr, ci, Mr, vt, fa, El, Pl, li, Ol, qn, jn, At, Rt, zn, Kn, Et, Vn, Ul, Pt, ql, jl, _a, Oe, Z, Ce, It, Or, Yn, Cr, $r, Gn, Nr, Se, Lr, Xn, Qn, ze, Zn, es, ts, Fr, hi, ga, Hr, fi, pi, mi, wa, _i, ba, ya, U, Tt, Ke, C, ee, G, Ve, xe, $e, Dr, ie, Je, Mt, Ye, ka, bi, yi, rs, ki, Si, xi, vi, Sa, Ai, Ei, Ra, Xl, ns, Ot, Ct, $t, Nt, Lt, Ft, Ht, Dt, ss, is, Bt, os, Wt, Ut, qt, as, cs, ls, jt, zt, us, ds, Kt, hs, Vt, fs, Jt, ps, Br, Ge, Xe, de, Ne, Yt, Wr, ms, Ur, qr, _s, jr, ve, zr, gs, ws, Qe, bs, ys, ks, Kr, Ti, Ia, Mi, Oi, Ci, $i, Ta, Ma, Gt, Vr, Oa, Iu, Ze, Xt, Jr, Li, Fi, Ss, Ca, Ou, Cu, $u, $a, Nu;
var init_anthropic_sdk = __esm({
  "prueba/vendor/anthropic-sdk.mjs"() {
    "use strict";
    Fa = Object.create;
    vs = Object.defineProperty;
    Ha = Object.getOwnPropertyDescriptor;
    Da = Object.getOwnPropertyNames;
    Ba = Object.getPrototypeOf;
    Wa = Object.prototype.hasOwnProperty;
    Qt = (r, s, e) => () => {
      if (e) throw e[0];
      try {
        return r && (s = r(r = 0)), s;
      } catch (t) {
        throw e = [t], t;
      }
    };
    Yr = (r, s) => () => {
      try {
        return s || r((s = { exports: {} }).exports, s), s.exports;
      } catch (e) {
        throw s = 0, e;
      }
    };
    Di = (r, s) => {
      for (var e in s) vs(r, e, { get: s[e], enumerable: true });
    };
    Ua = (r, s, e, t) => {
      if (s && typeof s == "object" || typeof s == "function") for (let n of Da(s)) !Wa.call(r, n) && n !== e && vs(r, n, { get: () => s[n], enumerable: !(t = Ha(s, n)) || t.enumerable });
      return r;
    };
    qa = (r, s, e) => (e = r != null ? Fa(Ba(r)) : {}, Ua(s || !r || !r.__esModule ? vs(e, "default", { value: r, enumerable: true }) : e, r));
    He = Qt(() => {
      Fe = (r) => {
        if (r instanceof Error) return r;
        if (typeof r == "object" && r !== null) {
          try {
            let s = Object.prototype.toString.call(r);
            if (s === "[object Error]" || s === "[object DOMException]") {
              let e = new Error(r.message, r.cause ? { cause: r.cause } : {});
              return r.stack && (e.stack = r.stack), r.cause && !e.cause && (e.cause = r.cause), r.name && (e.name = r.name), e;
            }
          } catch {
          }
          try {
            return new Error(JSON.stringify(r));
          } catch {
          }
        }
        return new Error(r);
      };
    });
    L = Qt(() => {
      He();
      y = /* @__PURE__ */ (() => {
        class r extends Error {
        }
        return r;
      })(), D = class r extends y {
        constructor(s, e, t, n, i) {
          super(`${r.makeMessage(s, e, t)}`), this.status = s, this.headers = n, this.requestID = n?.get("request-id"), this.workspaceID = n?.get("anthropic-workspace-id"), this.error = e, this.type = i ?? null;
        }
        static makeMessage(s, e, t) {
          let n = e?.message ? typeof e.message == "string" ? e.message : JSON.stringify(e.message) : e ? JSON.stringify(e) : t;
          return s && n ? `${s} ${n}` : s ? `${s} status code (no body)` : n || "(no status code or body)";
        }
        static generate(s, e, t, n) {
          if (!s || !n) return new Ae({ message: t, cause: Fe(e) });
          let i = e, o = i?.error?.type;
          return s === 400 ? new er(s, i, t, n, o) : s === 401 ? new tr(s, i, t, n, o) : s === 403 ? new rr(s, i, t, n, o) : s === 404 ? new nr(s, i, t, n, o) : s === 409 ? new sr(s, i, t, n, o) : s === 422 ? new ir(s, i, t, n, o) : s === 429 ? new or(s, i, t, n, o) : s >= 500 ? new ar(s, i, t, n, o) : new r(s, i, t, n, o);
        }
      }, J = class extends D {
        constructor({ message: s } = {}) {
          super(void 0, void 0, s || "Request was aborted.", void 0);
        }
      }, Ae = class extends D {
        constructor({ message: s, cause: e }) {
          super(void 0, void 0, s || "Connection error.", void 0), e && (this.cause = e);
        }
      }, Zt = class extends Ae {
        constructor({ message: s } = {}) {
          super({ message: s ?? "Request timed out." });
        }
      }, Gr = class extends y {
        constructor(s, { cause: e } = {}) {
          super(s ?? "Retryable error."), e !== void 0 && (this.cause = e);
        }
      }, er = class extends D {
      }, tr = class extends D {
      }, rr = class extends D {
      }, nr = class extends D {
      }, sr = class extends D {
      }, ir = class extends D {
      }, or = class extends D {
      }, ar = class extends D {
      };
    });
    we = {};
    Di(we, { child_process: () => tc, crypto: () => rc, fs: () => nc, os: () => sc, path: () => ic, stream: () => oc, util: () => ac });
    be = Qt(() => {
      L();
      tc = De("child_process"), rc = De("crypto"), nc = De("fs"), sc = De("os"), ic = De("path"), oc = De("stream"), ac = De("util");
    });
    Uo = Yr((ne) => {
      "use strict";
      var Dc = ne && ne.__extends || /* @__PURE__ */ (function() {
        var r = function(s, e) {
          return r = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(t, n) {
            t.__proto__ = n;
          } || function(t, n) {
            for (var i in n) n.hasOwnProperty(i) && (t[i] = n[i]);
          }, r(s, e);
        };
        return function(s, e) {
          r(s, e);
          function t() {
            this.constructor = s;
          }
          s.prototype = e === null ? Object.create(e) : (t.prototype = e.prototype, new t());
        };
      })();
      Object.defineProperty(ne, "__esModule", { value: true });
      var j = 256, Xs = (function() {
        function r(s) {
          s === void 0 && (s = "="), this._paddingCharacter = s;
        }
        return r.prototype.encodedLength = function(s) {
          return this._paddingCharacter ? (s + 2) / 3 * 4 | 0 : (s * 8 + 5) / 6 | 0;
        }, r.prototype.encode = function(s) {
          for (var e = "", t = 0; t < s.length - 2; t += 3) {
            var n = s[t] << 16 | s[t + 1] << 8 | s[t + 2];
            e += this._encodeByte(n >>> 18 & 63), e += this._encodeByte(n >>> 12 & 63), e += this._encodeByte(n >>> 6 & 63), e += this._encodeByte(n >>> 0 & 63);
          }
          var i = s.length - t;
          if (i > 0) {
            var n = s[t] << 16 | (i === 2 ? s[t + 1] << 8 : 0);
            e += this._encodeByte(n >>> 18 & 63), e += this._encodeByte(n >>> 12 & 63), i === 2 ? e += this._encodeByte(n >>> 6 & 63) : e += this._paddingCharacter || "", e += this._paddingCharacter || "";
          }
          return e;
        }, r.prototype.maxDecodedLength = function(s) {
          return this._paddingCharacter ? s / 4 * 3 | 0 : (s * 6 + 7) / 8 | 0;
        }, r.prototype.decodedLength = function(s) {
          return this.maxDecodedLength(s.length - this._getPaddingLength(s));
        }, r.prototype.decode = function(s) {
          if (s.length === 0) return new Uint8Array(0);
          for (var e = this._getPaddingLength(s), t = s.length - e, n = new Uint8Array(this.maxDecodedLength(t)), i = 0, o = 0, c = 0, d = 0, u = 0, p = 0, f = 0; o < t - 4; o += 4) d = this._decodeChar(s.charCodeAt(o + 0)), u = this._decodeChar(s.charCodeAt(o + 1)), p = this._decodeChar(s.charCodeAt(o + 2)), f = this._decodeChar(s.charCodeAt(o + 3)), n[i++] = d << 2 | u >>> 4, n[i++] = u << 4 | p >>> 2, n[i++] = p << 6 | f, c |= d & j, c |= u & j, c |= p & j, c |= f & j;
          if (o < t - 1 && (d = this._decodeChar(s.charCodeAt(o)), u = this._decodeChar(s.charCodeAt(o + 1)), n[i++] = d << 2 | u >>> 4, c |= d & j, c |= u & j), o < t - 2 && (p = this._decodeChar(s.charCodeAt(o + 2)), n[i++] = u << 4 | p >>> 2, c |= p & j), o < t - 3 && (f = this._decodeChar(s.charCodeAt(o + 3)), n[i++] = p << 6 | f, c |= f & j), c !== 0) throw new Error("Base64Coder: incorrect characters for decoding");
          return n;
        }, r.prototype._encodeByte = function(s) {
          var e = s;
          return e += 65, e += 25 - s >>> 8 & 6, e += 51 - s >>> 8 & -75, e += 61 - s >>> 8 & -15, e += 62 - s >>> 8 & 3, String.fromCharCode(e);
        }, r.prototype._decodeChar = function(s) {
          var e = j;
          return e += (42 - s & s - 44) >>> 8 & -j + s - 43 + 62, e += (46 - s & s - 48) >>> 8 & -j + s - 47 + 63, e += (47 - s & s - 58) >>> 8 & -j + s - 48 + 52, e += (64 - s & s - 91) >>> 8 & -j + s - 65 + 0, e += (96 - s & s - 123) >>> 8 & -j + s - 97 + 26, e;
        }, r.prototype._getPaddingLength = function(s) {
          var e = 0;
          if (this._paddingCharacter) {
            for (var t = s.length - 1; t >= 0 && s[t] === this._paddingCharacter; t--) e++;
            if (s.length < 4 || e > 2) throw new Error("Base64Coder: incorrect padding");
          }
          return e;
        }, r;
      })();
      ne.Coder = Xs;
      var kr = new Xs();
      function Bc(r) {
        return kr.encode(r);
      }
      ne.encode = Bc;
      function Wc(r) {
        return kr.decode(r);
      }
      ne.decode = Wc;
      var Bo = (function(r) {
        Dc(s, r);
        function s() {
          return r !== null && r.apply(this, arguments) || this;
        }
        return s.prototype._encodeByte = function(e) {
          var t = e;
          return t += 65, t += 25 - e >>> 8 & 6, t += 51 - e >>> 8 & -75, t += 61 - e >>> 8 & -13, t += 62 - e >>> 8 & 49, String.fromCharCode(t);
        }, s.prototype._decodeChar = function(e) {
          var t = j;
          return t += (44 - e & e - 46) >>> 8 & -j + e - 45 + 62, t += (94 - e & e - 96) >>> 8 & -j + e - 95 + 63, t += (47 - e & e - 58) >>> 8 & -j + e - 48 + 52, t += (64 - e & e - 91) >>> 8 & -j + e - 65 + 0, t += (96 - e & e - 123) >>> 8 & -j + e - 97 + 26, t;
        }, s;
      })(Xs);
      ne.URLSafeCoder = Bo;
      var Wo = new Bo();
      function Uc(r) {
        return Wo.encode(r);
      }
      ne.encodeURLSafe = Uc;
      function qc(r) {
        return Wo.decode(r);
      }
      ne.decodeURLSafe = qc;
      ne.encodedLength = function(r) {
        return kr.encodedLength(r);
      };
      ne.maxDecodedLength = function(r) {
        return kr.maxDecodedLength(r);
      };
      ne.decodedLength = function(r) {
        return kr.decodedLength(r);
      };
    });
    jo = Yr((qo, Sn) => {
      (function(r, s) {
        var e = {};
        s(e);
        var t = e.default;
        for (var n in e) t[n] = e[n];
        typeof Sn == "object" && typeof Sn.exports == "object" ? Sn.exports = t : typeof define == "function" && define.amd ? define(function() {
          return t;
        }) : r.sha256 = t;
      })(qo, function(r) {
        "use strict";
        r.__esModule = true, r.digestLength = 32, r.blockSize = 64;
        var s = new Uint32Array([1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580, 3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986, 2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298]);
        function e(f, m, b, g, x) {
          for (var A, E, k, I, v, R, $, M, N, F, W, oe, Le; x >= 64; ) {
            for (A = m[0], E = m[1], k = m[2], I = m[3], v = m[4], R = m[5], $ = m[6], M = m[7], F = 0; F < 16; F++) W = g + F * 4, f[F] = (b[W] & 255) << 24 | (b[W + 1] & 255) << 16 | (b[W + 2] & 255) << 8 | b[W + 3] & 255;
            for (F = 16; F < 64; F++) N = f[F - 2], oe = (N >>> 17 | N << 15) ^ (N >>> 19 | N << 13) ^ N >>> 10, N = f[F - 15], Le = (N >>> 7 | N << 25) ^ (N >>> 18 | N << 14) ^ N >>> 3, f[F] = (oe + f[F - 7] | 0) + (Le + f[F - 16] | 0);
            for (F = 0; F < 64; F++) oe = (((v >>> 6 | v << 26) ^ (v >>> 11 | v << 21) ^ (v >>> 25 | v << 7)) + (v & R ^ ~v & $) | 0) + (M + (s[F] + f[F] | 0) | 0) | 0, Le = ((A >>> 2 | A << 30) ^ (A >>> 13 | A << 19) ^ (A >>> 22 | A << 10)) + (A & E ^ A & k ^ E & k) | 0, M = $, $ = R, R = v, v = I + oe | 0, I = k, k = E, E = A, A = oe + Le | 0;
            m[0] += A, m[1] += E, m[2] += k, m[3] += I, m[4] += v, m[5] += R, m[6] += $, m[7] += M, g += 64, x -= 64;
          }
          return g;
        }
        var t = (function() {
          function f() {
            this.digestLength = r.digestLength, this.blockSize = r.blockSize, this.state = new Int32Array(8), this.temp = new Int32Array(64), this.buffer = new Uint8Array(128), this.bufferLength = 0, this.bytesHashed = 0, this.finished = false, this.reset();
          }
          return f.prototype.reset = function() {
            return this.state[0] = 1779033703, this.state[1] = 3144134277, this.state[2] = 1013904242, this.state[3] = 2773480762, this.state[4] = 1359893119, this.state[5] = 2600822924, this.state[6] = 528734635, this.state[7] = 1541459225, this.bufferLength = 0, this.bytesHashed = 0, this.finished = false, this;
          }, f.prototype.clean = function() {
            for (var m = 0; m < this.buffer.length; m++) this.buffer[m] = 0;
            for (var m = 0; m < this.temp.length; m++) this.temp[m] = 0;
            this.reset();
          }, f.prototype.update = function(m, b) {
            if (b === void 0 && (b = m.length), this.finished) throw new Error("SHA256: can't update because hash was finished.");
            var g = 0;
            if (this.bytesHashed += b, this.bufferLength > 0) {
              for (; this.bufferLength < 64 && b > 0; ) this.buffer[this.bufferLength++] = m[g++], b--;
              this.bufferLength === 64 && (e(this.temp, this.state, this.buffer, 0, 64), this.bufferLength = 0);
            }
            for (b >= 64 && (g = e(this.temp, this.state, m, g, b), b %= 64); b > 0; ) this.buffer[this.bufferLength++] = m[g++], b--;
            return this;
          }, f.prototype.finish = function(m) {
            if (!this.finished) {
              var b = this.bytesHashed, g = this.bufferLength, x = b / 536870912 | 0, A = b << 3, E = b % 64 < 56 ? 64 : 128;
              this.buffer[g] = 128;
              for (var k = g + 1; k < E - 8; k++) this.buffer[k] = 0;
              this.buffer[E - 8] = x >>> 24 & 255, this.buffer[E - 7] = x >>> 16 & 255, this.buffer[E - 6] = x >>> 8 & 255, this.buffer[E - 5] = x >>> 0 & 255, this.buffer[E - 4] = A >>> 24 & 255, this.buffer[E - 3] = A >>> 16 & 255, this.buffer[E - 2] = A >>> 8 & 255, this.buffer[E - 1] = A >>> 0 & 255, e(this.temp, this.state, this.buffer, 0, E), this.finished = true;
            }
            for (var k = 0; k < 8; k++) m[k * 4 + 0] = this.state[k] >>> 24 & 255, m[k * 4 + 1] = this.state[k] >>> 16 & 255, m[k * 4 + 2] = this.state[k] >>> 8 & 255, m[k * 4 + 3] = this.state[k] >>> 0 & 255;
            return this;
          }, f.prototype.digest = function() {
            var m = new Uint8Array(this.digestLength);
            return this.finish(m), m;
          }, f.prototype._saveState = function(m) {
            for (var b = 0; b < this.state.length; b++) m[b] = this.state[b];
          }, f.prototype._restoreState = function(m, b) {
            for (var g = 0; g < this.state.length; g++) this.state[g] = m[g];
            this.bytesHashed = b, this.finished = false, this.bufferLength = 0;
          }, f;
        })();
        r.Hash = t;
        var n = (function() {
          function f(m) {
            this.inner = new t(), this.outer = new t(), this.blockSize = this.inner.blockSize, this.digestLength = this.inner.digestLength;
            var b = new Uint8Array(this.blockSize);
            if (m.length > this.blockSize) new t().update(m).finish(b).clean();
            else for (var g = 0; g < m.length; g++) b[g] = m[g];
            for (var g = 0; g < b.length; g++) b[g] ^= 54;
            this.inner.update(b);
            for (var g = 0; g < b.length; g++) b[g] ^= 106;
            this.outer.update(b), this.istate = new Uint32Array(8), this.ostate = new Uint32Array(8), this.inner._saveState(this.istate), this.outer._saveState(this.ostate);
            for (var g = 0; g < b.length; g++) b[g] = 0;
          }
          return f.prototype.reset = function() {
            return this.inner._restoreState(this.istate, this.inner.blockSize), this.outer._restoreState(this.ostate, this.outer.blockSize), this;
          }, f.prototype.clean = function() {
            for (var m = 0; m < this.istate.length; m++) this.ostate[m] = this.istate[m] = 0;
            this.inner.clean(), this.outer.clean();
          }, f.prototype.update = function(m) {
            return this.inner.update(m), this;
          }, f.prototype.finish = function(m) {
            return this.outer.finished ? this.outer.finish(m) : (this.inner.finish(m), this.outer.update(m, this.digestLength).finish(m)), this;
          }, f.prototype.digest = function() {
            var m = new Uint8Array(this.digestLength);
            return this.finish(m), m;
          }, f;
        })();
        r.HMAC = n;
        function i(f) {
          var m = new t().update(f), b = m.digest();
          return m.clean(), b;
        }
        r.hash = i, r.default = i;
        function o(f, m) {
          var b = new n(f).update(m), g = b.digest();
          return b.clean(), g;
        }
        r.hmac = o;
        function c(f, m, b, g) {
          var x = g[0];
          if (x === 0) throw new Error("hkdf: cannot expand more");
          m.reset(), x > 1 && m.update(f), b && m.update(b), m.update(g), m.finish(f), g[0]++;
        }
        var d = new Uint8Array(r.digestLength);
        function u(f, m, b, g) {
          m === void 0 && (m = d), g === void 0 && (g = 32);
          for (var x = new Uint8Array([1]), A = o(m, f), E = new n(A), k = new Uint8Array(E.digestLength), I = k.length, v = new Uint8Array(g), R = 0; R < g; R++) I === k.length && (c(k, E, b, x), I = 0), v[R] = k[I++];
          return E.clean(), k.fill(0), x.fill(0), v;
        }
        r.hkdf = u;
        function p(f, m, b, g) {
          for (var x = new n(f), A = x.digestLength, E = new Uint8Array(4), k = new Uint8Array(A), I = new Uint8Array(A), v = new Uint8Array(g), R = 0; R * A < g; R++) {
            var $ = R + 1;
            E[0] = $ >>> 24 & 255, E[1] = $ >>> 16 & 255, E[2] = $ >>> 8 & 255, E[3] = $ >>> 0 & 255, x.reset(), x.update(m), x.update(E), x.finish(I);
            for (var M = 0; M < A; M++) k[M] = I[M];
            for (var M = 2; M <= b; M++) {
              x.reset(), x.update(I).finish(I);
              for (var N = 0; N < A; N++) k[N] ^= I[N];
            }
            for (var M = 0; M < A && R * A + M < g; M++) v[R * A + M] = k[M];
          }
          for (var R = 0; R < A; R++) k[R] = I[R] = 0;
          for (var R = 0; R < 4; R++) E[R] = 0;
          return x.clean(), v;
        }
        r.pbkdf2 = p;
      });
    });
    Ko = Yr((Qs) => {
      "use strict";
      Object.defineProperty(Qs, "__esModule", { value: true });
      Qs.timingSafeEqual = jc;
      function zo(r, s = "") {
        if (!r) throw new Error(s);
      }
      function jc(r, s) {
        if (r.byteLength !== s.byteLength) return false;
        r instanceof DataView || (r = new DataView(ArrayBuffer.isView(r) ? r.buffer : r)), s instanceof DataView || (s = new DataView(ArrayBuffer.isView(s) ? s.buffer : s)), zo(r instanceof DataView), zo(s instanceof DataView);
        let e = r.byteLength, t = 0, n = -1;
        for (; ++n < e; ) t |= r.getUint8(n) ^ s.getUint8(n);
        return t === 0;
      }
    });
    Yo = Yr((ut) => {
      "use strict";
      Object.defineProperty(ut, "__esModule", { value: true });
      ut.Webhook = ut.WebhookVerificationError = void 0;
      var Vo = Uo(), zc = jo(), Kc = Ko(), Jo = 300, Zs = class r extends Error {
        constructor(s) {
          super(s), Object.setPrototypeOf(this, r.prototype), this.name = "ExtendableError", this.stack = new Error(s).stack;
        }
      }, Ee = class r extends Zs {
        constructor(s) {
          super(s), Object.setPrototypeOf(this, r.prototype), this.name = "WebhookVerificationError";
        }
      };
      ut.WebhookVerificationError = Ee;
      var xn = class r {
        constructor(s, e) {
          if (e?.format === "raw") s instanceof Uint8Array ? this.key = s : this.key = Uint8Array.from(s, (t) => t.charCodeAt(0));
          else {
            if (typeof s != "string") throw new Error("Expected secret to be of type string");
            s.startsWith(r.prefix) && (s = s.substring(r.prefix.length)), this.key = Vo.decode(s);
          }
          if (this.key.length === 0) throw new Error("Secret can't be empty.");
        }
        verify(s, e, t) {
          var n;
          let i = (n = t?.jsonParse) !== null && n !== void 0 ? n : true, o = {};
          for (let x of Object.keys(e)) o[x.toLowerCase()] = e[x];
          let c = o["webhook-id"], d = o["webhook-signature"], u = o["webhook-timestamp"];
          if (!d || !c || !u) throw new Ee("Missing required headers");
          let p = this.verifyTimestamp(u), m = this.sign(c, p, s).split(",")[1], b = d.split(" "), g = new globalThis.TextEncoder();
          for (let x of b) {
            let [A, E] = x.split(",");
            if (A === "v1" && (0, Kc.timingSafeEqual)(g.encode(E), g.encode(m))) {
              let k = s.toString();
              return k === "" ? void 0 : i ? JSON.parse(k) : void 0;
            }
          }
          throw new Ee("No matching signature found");
        }
        sign(s, e, t) {
          if (typeof t != "string") if (t.constructor.name === "Buffer") t = t.toString();
          else throw new Error("Expected payload to be of type string or Buffer.");
          let n = new TextEncoder(), i = Math.floor(e.getTime() / 1e3), o = n.encode(`${s}.${i}.${t}`);
          return `v1,${Vo.encode(zc.hmac(this.key, o))}`;
        }
        verifyTimestamp(s) {
          let e = Math.floor(Date.now() / 1e3), t = parseInt(s, 10);
          if (Number.isNaN(t)) throw new Ee("Invalid Signature Headers");
          if (e - t > Jo) throw new Ee("Message timestamp too old");
          if (t > e + Jo) throw new Ee("Message timestamp too new");
          return new Date(t * 1e3);
        }
      };
      ut.Webhook = xn;
      xn.prefix = "whsec_";
    });
    ni = Qt(() => {
      L();
      la = 15e3, Wn = 5e3;
    });
    da = {};
    Di(da, { BashSession: () => ai, BashTimeoutError: () => oi, DEFAULT_MEMORY_SYNC_INTERVAL_MS: () => la, MARKER_PATH: () => _l, MEMORY_FLUSH_TIMEOUT_MS: () => ml, MIN_MEMORY_SYNC_INTERVAL_MS: () => Wn, SessionMemoryError: () => si, SessionMemoryStores: () => ii, betaAgentToolset20260401: () => bl, betaBashTool: () => kl, betaEditTool: () => vl, betaGlobTool: () => Al, betaGrepTool: () => Rl, betaReadTool: () => Sl, betaWriteTool: () => xl, extractSkillArchive: () => wl, resolvePath: () => yl, setupSkills: () => gl });
    ha = Qt(() => {
      L();
      ni();
      ml = 3e4, _l = ".anthropic-memory-store", si = class extends y {
        constructor(s, e) {
          super(s), this.name = "SessionMemoryError", e !== void 0 && (this.cause = e);
        }
      }, ii = class {
        constructor(s, e) {
          H("SessionMemoryStores");
        }
        get roots() {
          return H("SessionMemoryStores");
        }
        get readOnlyRoots() {
          return H("SessionMemoryStores");
        }
        download(s) {
          return H("SessionMemoryStores");
        }
        finish() {
          return H("SessionMemoryStores");
        }
        syncAll(s) {
          return H("SessionMemoryStores");
        }
        syncIfDue() {
          return H("SessionMemoryStores");
        }
        flushWrites(s) {
          return H("SessionMemoryStores");
        }
        dispose() {
          return H("SessionMemoryStores");
        }
      };
      oi = class extends y {
        constructor(s) {
          super(`bash command timed out after ${s}ms`), this.name = "BashTimeoutError", this.timeoutMs = s;
        }
      }, ai = class {
        constructor(s, e) {
          H("BashSession");
        }
        get closed() {
          return H("BashSession");
        }
        exec(s, e = {}) {
          return H("BashSession");
        }
        close() {
          H("BashSession");
        }
      };
    });
    L();
    za = /^[a-z][a-z0-9+.-]*:/i;
    Bi = (r) => za.test(r);
    Y = (r) => (Y = Array.isArray, Y(r));
    As = Y;
    Xr = (r, s) => {
      if (typeof s != "number" || !Number.isInteger(s)) throw new y(`${r} must be an integer`);
      if (s < 0) throw new y(`${r} must be a positive integer`);
      return s;
    };
    Qr = (r) => {
      try {
        return JSON.parse(r);
      } catch {
        return;
      }
    };
    X = (r, s) => {
      let e = r[s];
      return delete r[s], e;
    };
    fe = (r, s) => new Promise((e) => {
      if (s?.aborted) return e();
      let t = () => {
        clearTimeout(n), e();
      }, n = setTimeout(() => {
        s?.removeEventListener("abort", t), e();
      }, r);
      s?.addEventListener("abort", t, { once: true });
    });
    He();
    ae = "0.128.0";
    zi = () => typeof window < "u" && typeof window.document < "u" && typeof navigator < "u";
    Va = () => {
      let r = Ka();
      if (r === "deno") return { "X-Stainless-Lang": "js", "X-Stainless-Package-Version": ae, "X-Stainless-OS": qi(Deno.build.os), "X-Stainless-Arch": Ui(Deno.build.arch), "X-Stainless-Runtime": "deno", "X-Stainless-Runtime-Version": typeof Deno.version == "string" ? Deno.version : Deno.version?.deno ?? "unknown" };
      if (typeof EdgeRuntime < "u") return { "X-Stainless-Lang": "js", "X-Stainless-Package-Version": ae, "X-Stainless-OS": "Unknown", "X-Stainless-Arch": `other:${EdgeRuntime}`, "X-Stainless-Runtime": "edge", "X-Stainless-Runtime-Version": globalThis.process?.version ?? "unknown" };
      if (r === "node") return { "X-Stainless-Lang": "js", "X-Stainless-Package-Version": ae, "X-Stainless-OS": qi(globalThis.process.platform ?? "unknown"), "X-Stainless-Arch": Ui(globalThis.process.arch ?? "unknown"), "X-Stainless-Runtime": "node", "X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown" };
      let s = Ja();
      return s ? { "X-Stainless-Lang": "js", "X-Stainless-Package-Version": ae, "X-Stainless-OS": "Unknown", "X-Stainless-Arch": "unknown", "X-Stainless-Runtime": `browser:${s.browser}`, "X-Stainless-Runtime-Version": s.version } : { "X-Stainless-Lang": "js", "X-Stainless-Package-Version": ae, "X-Stainless-OS": "Unknown", "X-Stainless-Arch": "unknown", "X-Stainless-Runtime": "unknown", "X-Stainless-Runtime-Version": "unknown" };
    };
    Ui = (r) => r === "x32" ? "x32" : r === "x86_64" || r === "x64" ? "x64" : r === "arm" ? "arm" : r === "aarch64" || r === "arm64" ? "arm64" : r ? `other:${r}` : "unknown";
    qi = (r) => (r = r.toLowerCase(), r.includes("ios") ? "iOS" : r === "android" ? "Android" : r === "darwin" ? "MacOS" : r === "win32" ? "Windows" : r === "freebsd" ? "FreeBSD" : r === "openbsd" ? "OpenBSD" : r === "linux" ? "Linux" : r ? `Other:${r}` : "Unknown");
    lr = () => ji ?? (ji = Va());
    Zr = /* @__PURE__ */ new WeakMap();
    Ki = typeof globalThis.FinalizationRegistry == "function" ? new globalThis.FinalizationRegistry((r) => _e(r)) : null;
    Xi = ({ headers: r, body: s }) => ({ bodyHeaders: { "content-type": "application/json" }, body: JSON.stringify(s) });
    Is = "RFC3986";
    Ts = (r) => String(r);
    Ms = { RFC1738: (r) => String(r).replace(/%20/g, "+"), RFC3986: Ts };
    Qi = "RFC1738";
    tn = (r, s) => (tn = Object.hasOwn ?? Function.prototype.call.bind(Object.prototype.hasOwnProperty), tn(r, s));
    ge = (() => {
      let r = [];
      for (let s = 0; s < 256; ++s) r.push("%" + ((s < 16 ? "0" : "") + s.toString(16)).toUpperCase());
      return r;
    })();
    Os = 1024;
    Zi = (r, s, e, t, n) => {
      if (r.length === 0) return r;
      let i = r;
      if (typeof r == "symbol" ? i = Symbol.prototype.toString.call(r) : typeof r != "string" && (i = String(r)), e === "iso-8859-1") return escape(i).replace(/%u[0-9a-f]{4}/gi, function(c) {
        return "%26%23" + parseInt(c.slice(2), 16) + "%3B";
      });
      let o = "";
      for (let c = 0; c < i.length; c += Os) {
        let d = i.length >= Os ? i.slice(c, c + Os) : i, u = [];
        for (let p = 0; p < d.length; ++p) {
          let f = d.charCodeAt(p);
          if (f === 45 || f === 46 || f === 95 || f === 126 || f >= 48 && f <= 57 || f >= 65 && f <= 90 || f >= 97 && f <= 122 || n === Qi && (f === 40 || f === 41)) {
            u[u.length] = d.charAt(p);
            continue;
          }
          if (f < 128) {
            u[u.length] = ge[f];
            continue;
          }
          if (f < 2048) {
            u[u.length] = ge[192 | f >> 6] + ge[128 | f & 63];
            continue;
          }
          if (f < 55296 || f >= 57344) {
            u[u.length] = ge[224 | f >> 12] + ge[128 | f >> 6 & 63] + ge[128 | f & 63];
            continue;
          }
          p += 1, f = 65536 + ((f & 1023) << 10 | d.charCodeAt(p) & 1023), u[u.length] = ge[240 | f >> 18] + ge[128 | f >> 12 & 63] + ge[128 | f >> 6 & 63] + ge[128 | f & 63];
        }
        o += u.join("");
      }
      return o;
    };
    ro = { brackets(r) {
      return String(r) + "[]";
    }, comma: "comma", indices(r, s) {
      return String(r) + "[" + s + "]";
    }, repeat(r) {
      return String(r);
    } };
    no = function(r, s) {
      Array.prototype.push.apply(r, Y(s) ? s : [s]);
    };
    K = { addQueryPrefix: false, allowDots: false, allowEmptyArrays: false, arrayFormat: "indices", charset: "utf-8", charsetSentinel: false, delimiter: "&", encode: true, encodeDotInKeys: false, encoder: Zi, encodeValuesOnly: false, format: Is, formatter: Ts, indices: false, serializeDate(r) {
      return (to ?? (to = Function.prototype.call.bind(Date.prototype.toISOString)))(r);
    }, skipNulls: false, strictNullHandling: false };
    $s = {};
    L();
    L();
    co = "urn:ietf:params:oauth:grant-type:jwt-bearer";
    lo = "refresh_token";
    rn = "/v1/oauth/token";
    Be = "oauth-2025-04-20";
    uo = "oidc-federation-2026-04-01";
    ho = 120;
    tt = 30;
    fo = 5;
    ao = 1 << 20;
    Ns = 2e3;
    cc = /* @__PURE__ */ new Set(["error", "error_description", "error_uri"]);
    O = class extends y {
      constructor(s, e = null, t = null, n = null) {
        super(s), this.statusCode = e, this.body = t, this.requestId = n;
      }
    };
    cn = class {
      constructor(s, e) {
        this.cached = null, this.pendingRefresh = null, this.nextForce = false, this.lastAdvisoryError = 0, this.provider = s, this.onAdvisoryRefreshError = e;
      }
      async getToken() {
        let s = this.nextForce;
        this.nextForce = false;
        let e = this.cached;
        if (s || e == null) return (await this.refresh(s)).token;
        if (e.expiresAt == null) return e.token;
        let t = e.expiresAt - pe();
        return t > ho ? e.token : t > tt ? (this.backgroundRefresh(), e.token) : (await this.refresh()).token;
      }
      invalidate() {
        this.cached = null, this.nextForce = true;
      }
      refresh(s = false) {
        return this.pendingRefresh && !s ? this.pendingRefresh : this.doRefresh(s);
      }
      backgroundRefresh() {
        this.pendingRefresh || pe() - this.lastAdvisoryError < fo || this.doRefresh().catch((s) => {
          this.lastAdvisoryError = pe(), this.onAdvisoryRefreshError?.(s);
        });
      }
      doRefresh(s = false) {
        return this.pendingRefresh = this.provider(s ? { forceRefresh: true } : void 0).then((e) => (this.cached = e, this.pendingRefresh = null, e), (e) => {
          throw this.pendingRefresh = null, e;
        }), this.pendingRefresh;
      }
    };
    P = (r) => {
      if (typeof globalThis.process < "u") return globalThis.process.env?.[r]?.trim() || void 0;
      if (typeof globalThis.Deno < "u") return globalThis.Deno.env?.get?.(r)?.trim() || void 0;
    };
    L();
    go = (r) => {
      if (typeof globalThis.Buffer < "u") {
        let s = globalThis.Buffer.from(r, "base64");
        return new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
      }
      if (typeof atob < "u") {
        let s = atob(r), e = new Uint8Array(s.length);
        for (let t = 0; t < s.length; t++) e[t] = s.charCodeAt(t);
        return e;
      }
      throw new y("Cannot decode base64 string; Expected `Buffer` or `atob` to be defined");
    };
    fr = "warn";
    un = { off: 0, error: 200, warn: 300, info: 400, debug: 500 };
    dn = (r, s, e) => {
      if (r) {
        if (Wi(un, r)) return r;
        e.warn(`${s} was set to ${JSON.stringify(r)}, expected one of ${JSON.stringify(Object.keys(un))}`);
      }
    };
    uc = { error: rt, warn: rt, info: rt, debug: rt };
    wo = /* @__PURE__ */ new WeakMap();
    dc = (r) => (r.options && (r.options = { ...r.options }, delete r.options.headers), r.headers && (r.headers = Object.fromEntries((r.headers instanceof Headers ? [...r.headers] : Object.entries(r.headers)).map(([s, e]) => [s, s.toLowerCase() === "authorization" || s.toLowerCase() === "api-key" || s.toLowerCase() === "x-api-key" || s.toLowerCase() === "cookie" || s.toLowerCase() === "set-cookie" ? "***" : e]))), "retryOfRequestLogID" in r && (r.retryOfRequestLogID && (r.retryOf = r.retryOfRequestLogID), delete r.retryOfRequestLogID), r);
    hn = function() {
      let { crypto: r } = globalThis;
      if (r?.randomUUID) return hn = r.randomUUID.bind(r), r.randomUUID();
      let s = new Uint8Array(1), e = r ? () => r.getRandomValues(s)[0] : () => Math.random() * 255 & 255;
      return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (t) => (+t ^ e() & 15 >> +t / 4).toString(16));
    };
    fn = "1.0";
    hc = /^[A-Za-z0-9_.-]+$/;
    So = async (r) => {
      var s, e;
      let t = await Hs();
      if (t === null) return null;
      let n = r ?? await vo();
      if (n === null) return null;
      ko(n);
      let { fs: i, path: o } = await Promise.resolve().then(() => (be(), we)), c = o.join(t, "configs", `${n}.json`), d;
      try {
        d = await i.promises.readFile(c, "utf-8");
      } catch (f) {
        if (f?.code !== "ENOENT") throw new Error(`failed to read config file ${c}: ${f}`);
        d = null;
      }
      if (d === null) {
        let f = P("ANTHROPIC_ORGANIZATION_ID"), m = P("ANTHROPIC_IDENTITY_TOKEN_FILE"), b = P("ANTHROPIC_FEDERATION_RULE_ID");
        return b && f ? { fromFile: false, config: { organization_id: f, workspace_id: P("ANTHROPIC_WORKSPACE_ID"), base_url: P("ANTHROPIC_BASE_URL"), authentication: { type: "oidc_federation", federation_rule_id: b, service_account_id: P("ANTHROPIC_SERVICE_ACCOUNT_ID"), identity_token: m ? { source: "file", path: m } : void 0, scope: P("ANTHROPIC_SCOPE") } } } : null;
      }
      let u;
      try {
        u = JSON.parse(d);
      } catch (f) {
        throw new Error(`failed to parse config file ${c}: ${f}`);
      }
      if (!u.authentication) throw new Error(`config file ${c} is missing "authentication"`);
      let p = u.authentication.type;
      if (p !== "oidc_federation" && p !== "user_oauth") throw new Error(`authentication.type "${p}" is not a known authentication type`);
      if (u.organization_id ?? (u.organization_id = P("ANTHROPIC_ORGANIZATION_ID")), u.workspace_id ?? (u.workspace_id = P("ANTHROPIC_WORKSPACE_ID")), u.base_url ?? (u.base_url = P("ANTHROPIC_BASE_URL")), (s = u.authentication).scope ?? (s.scope = P("ANTHROPIC_SCOPE")), u.authentication.type === "oidc_federation") {
        if (!u.authentication.identity_token) {
          let f = P("ANTHROPIC_IDENTITY_TOKEN_FILE");
          f && (u.authentication.identity_token = { source: "file", path: f });
        }
        u.authentication.federation_rule_id || (u.authentication.federation_rule_id = P("ANTHROPIC_FEDERATION_RULE_ID") ?? ""), (e = u.authentication).service_account_id ?? (e.service_account_id = P("ANTHROPIC_SERVICE_ACCOUNT_ID"));
      }
      return { config: u, fromFile: true };
    };
    xo = async (r, s) => {
      if (r?.authentication.credentials_path) return r.authentication.credentials_path;
      let e = await Hs();
      if (!e) return null;
      let t = s ?? await vo();
      if (!t) return null;
      ko(t);
      let { path: n } = await Promise.resolve().then(() => (be(), we));
      return n.join(e, "credentials", `${t}.json`);
    };
    Hs = async () => {
      if (!fc()) return null;
      let { path: r } = await Promise.resolve().then(() => (be(), we)), s = P("ANTHROPIC_CONFIG_DIR");
      if (s) return s;
      if (lr()["X-Stainless-OS"] === "Windows") {
        let i = P("APPDATA");
        if (i) return r.join(i, "Anthropic");
        let o = P("USERPROFILE");
        return o ? r.join(o, "AppData", "Roaming", "Anthropic") : null;
      }
      let t = P("XDG_CONFIG_HOME");
      if (t) return r.join(t, "anthropic");
      let n = P("HOME");
      return n ? r.join(n, ".config", "anthropic") : null;
    };
    fc = () => {
      let r = lr()["X-Stainless-Runtime"];
      return r === "node" || r === "deno";
    };
    vo = async () => {
      let r = await Hs();
      if (!r) return null;
      let s = P("ANTHROPIC_PROFILE");
      if (s) return s;
      let { fs: e, path: t } = await Promise.resolve().then(() => (be(), we)), n = t.join(r, "active_config");
      try {
        return (await e.promises.readFile(n, "utf-8")).trim() || "default";
      } catch (i) {
        if (i?.code !== "ENOENT") throw new Error(`failed to read ${n}: ${i}`);
        return "default";
      }
    };
    L();
    He();
    L();
    pr = (() => {
      class r {
        constructor() {
          te.set(this, void 0), re.set(this, void 0), _(this, te, new Uint8Array(), "f"), _(this, re, null, "f");
        }
        decode(e) {
          if (e == null) return [];
          let t = e instanceof ArrayBuffer ? new Uint8Array(e) : typeof e == "string" ? dr(e) : e;
          _(this, te, _o([a(this, te, "f"), t]), "f");
          let n = [], i;
          for (; (i = gc(a(this, te, "f"), a(this, re, "f"))) != null; ) {
            if (i.carriage && a(this, re, "f") == null) {
              _(this, re, i.index, "f");
              continue;
            }
            if (a(this, re, "f") != null && (i.index !== a(this, re, "f") + 1 || i.carriage)) {
              n.push(hr(a(this, te, "f").subarray(0, a(this, re, "f") - 1))), _(this, te, a(this, te, "f").subarray(a(this, re, "f")), "f"), _(this, re, null, "f");
              continue;
            }
            let o = a(this, re, "f") !== null ? i.preceding - 1 : i.preceding, c = hr(a(this, te, "f").subarray(0, o));
            n.push(c), _(this, te, a(this, te, "f").subarray(i.index), "f"), _(this, re, null, "f");
          }
          return n;
        }
        flush() {
          return a(this, te, "f").length ? this.decode(`
`) : [];
        }
      }
      return te = /* @__PURE__ */ new WeakMap(), re = /* @__PURE__ */ new WeakMap(), r.NEWLINE_CHARS = /* @__PURE__ */ new Set([`
`, "\r"]), r.NEWLINE_REGEXP = /\r\n|[\n\r]/g, r;
    })();
    He();
    L();
    ke = (() => {
      class r {
        constructor(e, t, n) {
          this.iterator = e, mr.set(this, void 0), this.controller = t, _(this, mr, n, "f");
        }
        static rawEvents(e, t = new AbortController()) {
          return To(e, t);
        }
        static fromSSEResponse(e, t, n) {
          let i = false, o = n ? T(n) : console;
          async function* c() {
            if (i) throw new y("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
            i = true;
            let d = false;
            try {
              for await (let u of To(e, t)) {
                if (u.event === "completion") try {
                  yield JSON.parse(u.data);
                } catch (p) {
                  throw o.error("Could not parse message into JSON:", u.data), o.error("From chunk:", u.raw), p;
                }
                if (u.event === "message_start" || u.event === "message_delta" || u.event === "message_stop" || u.event === "content_block_start" || u.event === "content_block_delta" || u.event === "content_block_stop" || u.event === "message" || u.event === "user.message" || u.event === "user.interrupt" || u.event === "user.tool_confirmation" || u.event === "user.custom_tool_result" || u.event === "user.tool_result" || u.event === "agent.message" || u.event === "agent.thinking" || u.event === "agent.tool_use" || u.event === "agent.tool_result" || u.event === "agent.mcp_tool_use" || u.event === "agent.mcp_tool_result" || u.event === "agent.custom_tool_use" || u.event === "agent.thread_context_compacted" || u.event === "session.status_running" || u.event === "session.status_idle" || u.event === "session.status_rescheduled" || u.event === "session.status_terminated" || u.event === "session.error" || u.event === "session.deleted" || u.event === "session.updated" || u.event === "span.model_request_start" || u.event === "span.model_request_end" || u.event === "span.outcome_evaluation_start" || u.event === "span.outcome_evaluation_ongoing" || u.event === "span.outcome_evaluation_end" || u.event === "user.define_outcome" || u.event === "agent.thread_message_received" || u.event === "agent.thread_message_sent" || u.event === "agent.session_thread_message_received" || u.event === "agent.session_thread_message_sent" || u.event === "session.thread_created" || u.event === "session.thread_status_created" || u.event === "session.thread_status_running" || u.event === "session.thread_status_idle" || u.event === "session.thread_status_rescheduled" || u.event === "session.thread_status_terminated" || u.event === "event_start" || u.event === "event_delta" || u.event === "system.message") try {
                  yield JSON.parse(u.data);
                } catch (p) {
                  throw o.error("Could not parse message into JSON:", u.data), o.error("From chunk:", u.raw), p;
                }
                if (u.event !== "ping" && u.event === "error") {
                  let p = Qr(u.data) ?? u.data, f = p?.error?.type;
                  throw new D(void 0, p, void 0, e.headers, f);
                }
              }
              d = true;
            } catch (u) {
              if (he(u)) return;
              throw u;
            } finally {
              d || t.abort(), _e(t);
            }
          }
          return new r(c, t, n);
        }
        static fromReadableStream(e, t, n) {
          let i = false;
          async function* o() {
            let d = new pr(), u = ur(e);
            for await (let p of u) for (let f of d.decode(p)) yield f;
            for (let p of d.flush()) yield p;
          }
          async function* c() {
            if (i) throw new y("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
            i = true;
            let d = false;
            try {
              for await (let u of o()) d || u && (yield JSON.parse(u));
              d = true;
            } catch (u) {
              if (he(u)) return;
              throw u;
            } finally {
              d || t.abort(), _e(t);
            }
          }
          return new r(c, t, n);
        }
        [(mr = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
          return this.iterator();
        }
        tee() {
          let e = [], t = [], n = this.iterator(), i = (o) => ({ next: () => {
            if (o.length === 0) {
              let c = n.next();
              e.push(c), t.push(c);
            }
            return o.shift();
          } });
          return [new r(() => i(e), this.controller, a(this, mr, "f")), new r(() => i(t), this.controller, a(this, mr, "f"))];
        }
        toReadableStream() {
          let e = this, t;
          return Ps({ async start() {
            t = e[Symbol.asyncIterator]();
          }, async pull(n) {
            try {
              let { value: i, done: o } = await t.next();
              if (o) return n.close();
              let c = dr(JSON.stringify(i) + `
`);
              n.enqueue(c);
            } catch (i) {
              n.error(i);
            }
          }, async cancel() {
            await t.return?.();
          } });
        }
      }
      return r;
    })();
    Ws = class {
      constructor() {
        this.event = null, this.data = [], this.chunks = [];
      }
      decode(s) {
        if (s.endsWith("\r") && (s = s.substring(0, s.length - 1)), !s) {
          if (!this.event && !this.data.length) return null;
          let i = { event: this.event, data: this.data.join(`
`), raw: this.chunks };
          return this.event = null, this.data = [], this.chunks = [], i;
        }
        if (this.chunks.push(s), s.startsWith(":")) return null;
        let [e, t, n] = bc(s, ":");
        return n.startsWith(" ") && (n = n.substring(1)), e === "event" ? this.event = n : e === "data" && this.data.push(n), null;
      }
    };
    L();
    Oo = /* @__PURE__ */ new WeakSet();
    L();
    mn = (() => {
      class r extends Promise {
        constructor(e, t, n = pn) {
          super((i) => {
            i(null);
          }), this.responsePromise = t, this.parseResponse = n, gr.set(this, void 0), _(this, gr, e, "f");
        }
        _thenUnwrap(e) {
          return new r(a(this, gr, "f"), this.responsePromise, async (t, n) => _r(e(await this.parseResponse(t, n), n), n.response));
        }
        asResponse() {
          return this.responsePromise.then((e) => e.response);
        }
        async withResponse() {
          let [e, t] = await Promise.all([this.parse(), this.asResponse()]);
          return { data: e, response: t, request_id: t.headers.get("request-id"), workspace_id: t.headers.get("anthropic-workspace-id") };
        }
        parse() {
          return this.parsedPromise || (this.parsedPromise = this.responsePromise.then((e) => this.parseResponse(a(this, gr, "f"), e))), this.parsedPromise;
        }
        then(e, t) {
          return this.parse().then(e, t);
        }
        catch(e) {
          return this.parse().catch(e);
        }
        finally(e) {
          return this.parse().finally(e);
        }
      }
      return gr = /* @__PURE__ */ new WeakMap(), r;
    })();
    js = (() => {
      class r {
        constructor(e, t, n, i) {
          _n.set(this, void 0), _(this, _n, e, "f"), this.options = i, this.response = t, this.body = n;
        }
        hasNextPage() {
          return this.getPaginatedItems().length ? this.nextPageRequestOptions() != null : false;
        }
        async getNextPage() {
          let e = this.nextPageRequestOptions();
          if (!e) throw new y("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
          return await a(this, _n, "f").requestAPIList(this.constructor, e);
        }
        async *iterPages() {
          let e = this;
          for (yield e; e.hasNextPage(); ) e = await e.getNextPage(), yield e;
        }
        async *[(_n = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
          for await (let e of this.iterPages()) for (let t of e.getPaginatedItems()) yield t;
        }
      }
      return r;
    })();
    $o = /* @__PURE__ */ (() => {
      class r extends mn {
        constructor(e, t, n) {
          super(e, t, async (i, o) => new n(i, o.response, await pn(i, o), o.options));
        }
        async *[Symbol.asyncIterator]() {
          let e = await this;
          for await (let t of e) yield t;
        }
      }
      return r;
    })();
    q = class extends js {
      constructor(s, e, t, n) {
        super(s, e, t, n), this.data = t.data || [], this.has_more = t.has_more || false, this.first_id = t.first_id || null, this.last_id = t.last_id || null;
      }
      getPaginatedItems() {
        return this.data ?? [];
      }
      hasNextPage() {
        return this.has_more === false ? false : super.hasNextPage();
      }
      nextPageRequestOptions() {
        if (this.options.query?.before_id) {
          let e = this.first_id;
          return e ? { ...this.options, query: { ...cr(this.options.query), before_id: e } } : null;
        }
        let s = this.last_id;
        return s ? { ...this.options, query: { ...cr(this.options.query), after_id: s } } : null;
      }
    };
    S = class extends js {
      constructor(s, e, t, n) {
        super(s, e, t, n), this.data = t.data || [], this.next_page = t.next_page || null;
      }
      getPaginatedItems() {
        return this.data ?? [];
      }
      nextPageRequestOptions() {
        let s = this.next_page;
        return s ? { ...this.options, query: { ...cr(this.options.query), page: s } } : null;
      }
    };
    gn = class extends js {
      constructor(s, e, t, n) {
        super(s, e, t, n), this.data = t.data || [], this.next_page = t.next_page || null, this.prev_page = t.prev_page || null;
      }
      getPaginatedItems() {
        return this.data ?? [];
      }
      nextPageRequestOptions() {
        let s = this.next_page;
        return s ? { ...this.options, query: { ...cr(this.options.query), page: s } } : null;
      }
    };
    Ks = () => {
      if (typeof File > "u") {
        let { process: r } = globalThis, s = typeof r?.versions?.node == "string" && parseInt(r.versions.node.split(".")) < 20;
        throw new Error("`File` is not defined as a global, which is required for file uploads." + (s ? " Update to Node 20 LTS or newer, or set `globalThis.File` to `import('node:buffer').File`." : ""));
      }
    };
    Vs = (r) => r != null && typeof r == "object" && typeof r[Symbol.asyncIterator] == "function";
    ce = async (r, s, e = true) => ({ ...r, body: await vc(r.body, s, e) });
    No = /* @__PURE__ */ new WeakMap();
    vc = async (r, s, e = true) => {
      if (!await xc(s)) throw new TypeError("The provided fetch function does not support file uploads with the current global FormData class.");
      let t = new FormData();
      return await Promise.all(Object.entries(r || {}).map(([n, i]) => zs(t, n, i, e))), t;
    };
    zs = async (r, s, e, t) => {
      if (e !== void 0) {
        if (e == null) throw new TypeError(`Received null for "${s}"; to pass null in FormData, you must use the string 'null'`);
        if (typeof e == "string" || typeof e == "number" || typeof e == "boolean") r.append(s, String(e));
        else if (e instanceof Response) {
          let n = {}, i = e.headers.get("Content-Type");
          i && (n = { type: i }), r.append(s, We([await e.blob()], wr(e, t), n));
        } else if (Vs(e)) r.append(s, We([await new Response(en(e)).blob()], wr(e, t)));
        else if (e instanceof Blob) r.append(s, We([e], wr(e, t) || void 0, { type: e.type }));
        else if (Array.isArray(e)) await Promise.all(e.map((n) => zs(r, s + "[]", n, t)));
        else {
          if (typeof e.then == "function") throw new TypeError(`Received a Promise for "${s}"; await it first, e.g. \`await toFile(...)\``);
          if (e instanceof ArrayBuffer || ArrayBuffer.isView(e)) throw new TypeError(`Received ${e.constructor.name} for "${s}"; to upload raw bytes, wrap them with \`await toFile(bytes, 'filename')\``);
          if (typeof e == "object") await Promise.all(Object.entries(e).map(([n, i]) => zs(r, `${s}[${n}]`, i, t)));
          else throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${e} instead`);
        }
      }
    };
    Lo = (r) => r != null && typeof r == "object" && typeof r.size == "number" && typeof r.type == "string" && typeof r.text == "function" && typeof r.slice == "function" && typeof r.arrayBuffer == "function";
    Ac = (r) => r != null && typeof r == "object" && typeof r.name == "string" && typeof r.lastModified == "number" && Lo(r);
    Rc = (r) => r != null && typeof r == "object" && typeof r.url == "string" && typeof r.blob == "function";
    w = class {
      constructor(s) {
        this._client = s;
      }
    };
    Fo = /* @__PURE__ */ Symbol.for("brand.privateNullableHeaders");
    wn = /* @__PURE__ */ Symbol("clear");
    Tc = /* @__PURE__ */ new Set(["x-stainless-helper"]);
    Mc = (r, s) => {
      let e = r ? r.split(",").map((t) => t.trim()).filter(Boolean) : [];
      for (let t of s.split(",").map((n) => n.trim())) t && !e.includes(t) && e.push(t);
      return e.join(", ");
    };
    l = (r) => {
      let s = new Headers(), e = /* @__PURE__ */ new Set();
      for (let t of r) {
        let n = /* @__PURE__ */ new Set();
        for (let [i, o] of Ic(t)) {
          let c = i.toLowerCase();
          if (Tc.has(c)) {
            if (o === wn) continue;
            o === null ? (s.delete(i), e.add(c)) : (s.set(i, Mc(s.get(i), o)), e.delete(c));
            continue;
          }
          (o === wn || !n.has(c)) && (s.delete(i), n.add(c), o === wn) || (o === null ? (s.delete(i), e.add(c)) : (s.append(i, o), e.delete(c)));
        }
      }
      return { [Fo]: true, values: s, nulls: e };
    };
    L();
    Ho = Object.freeze(/* @__PURE__ */ Object.create(null));
    Oc = (r = Do) => function(e, ...t) {
      if (e.length === 1) return e[0];
      let n = false, i = [], o = e.reduce((p, f, m) => {
        /[?#]/.test(f) && (n = true);
        let b = t[m], g = (n ? encodeURIComponent : r)("" + b);
        return m !== t.length && (b == null || typeof b == "object" && b.toString === Object.getPrototypeOf(Object.getPrototypeOf(b.hasOwnProperty ?? Ho) ?? Ho)?.toString) && (g = b + "", i.push({ start: p.length + f.length, length: g.length, error: `Value of type ${Object.prototype.toString.call(b).slice(8, -1)} is not a valid path parameter` })), p + f + (m === t.length ? "" : g);
      }, ""), c = o.split(/[?#]/, 1)[0], d = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi, u;
      for (; (u = d.exec(c)) !== null; ) i.push({ start: u.index, length: u[0].length, error: `Value "${u[0]}" can't be safely passed as a path parameter` });
      if (i.sort((p, f) => p.start - f.start), i.length > 0) {
        let p = 0, f = i.reduce((m, b) => {
          let g = " ".repeat(b.start - p), x = "^".repeat(b.length);
          return p = b.start + b.length, m + g + x;
        }, "");
        throw new y(`Path parameters result in path with invalid segments:
${i.map((m) => m.error).join(`
`)}
${o}
${f}`);
      }
      return o;
    };
    h = Oc(Do);
    nt = class extends w {
      retrieve(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/deployment_runs/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { betas: t, workspace_id: n, ...i } = s ?? {};
        return this._client.getAPIList("/v1/deployment_runs?beta=true", S, { query: i, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "managed-agents-2026-04-01"].toString(), ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
    };
    st = class extends w {
      create(s, e) {
        let { betas: t, workspace_id: n, ...i } = s;
        return this._client.post("/v1/deployments?beta=true", { body: i, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "managed-agents-2026-04-01"].toString(), ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      retrieve(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/deployments/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      update(s, e, t) {
        let { betas: n, workspace_id: i, ...o } = e;
        return this._client.post(h`/v1/deployments/${s}?beta=true`, { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { betas: t, workspace_id: n, ...i } = s ?? {};
        return this._client.getAPIList("/v1/deployments?beta=true", S, { query: i, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "managed-agents-2026-04-01"].toString(), ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      archive(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.post(h`/v1/deployments/${s}/archive?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      pause(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.post(h`/v1/deployments/${s}/pause?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      run(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.post(h`/v1/deployments/${s}/run?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      unpause(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.post(h`/v1/deployments/${s}/unpause?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
    };
    it = class extends w {
      create(s, e) {
        let { betas: t, workspace_id: n, ...i } = s;
        return this._client.post("/v1/dreams?beta=true", { body: i, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "dreaming-2026-04-21"].toString(), ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      retrieve(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/dreams/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "dreaming-2026-04-21"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { betas: t, workspace_id: n, ...i } = s ?? {};
        return this._client.getAPIList("/v1/dreams?beta=true", S, { query: i, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "dreaming-2026-04-21"].toString(), ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      archive(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.post(h`/v1/dreams/${s}/archive?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "dreaming-2026-04-21"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      cancel(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.post(h`/v1/dreams/${s}/cancel?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "dreaming-2026-04-21"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
    };
    Ue = "x-stainless-helper";
    bn = "x-stainless-helper-method";
    ot = /* @__PURE__ */ Symbol("anthropic.sdk.stainlessHelper");
    at = class extends w {
      list(s = {}, e) {
        let { betas: t, workspace_id: n, ...i } = s ?? {};
        return this._client.getAPIList("/v1/files?beta=true", S, { query: i, ...e, headers: l([{ ...t?.toString() != null ? { "anthropic-beta": t?.toString() } : void 0, ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      delete(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.delete(h`/v1/files/${s}?beta=true`, { ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      download(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/files/${s}/content?beta=true`, { ...t, headers: l([{ Accept: "application/binary", ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]), __binaryResponse: true });
      }
      retrieveMetadata(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/files/${s}?beta=true`, { ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      upload(s, e) {
        let { betas: t, workspace_id: n, ...i } = s;
        return this._client.post("/v1/files?beta=true", ce({ body: i, ...e, headers: l([{ ...t?.toString() != null ? { "anthropic-beta": t?.toString() } : void 0, ...n != null ? { "anthropic-workspace-id": n } : void 0 }, kn(i.file), e?.headers]) }, this._client));
      }
    };
    ct = class extends w {
      retrieve(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/models/${s}?beta=true`, { ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { betas: t, workspace_id: n, ...i } = s ?? {};
        return this._client.getAPIList("/v1/models?beta=true", q, { query: i, ...e, headers: l([{ ...t?.toString() != null ? { "anthropic-beta": t?.toString() } : void 0, ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
    };
    lt = class extends w {
      create(s, e) {
        let { betas: t, workspace_id: n, ...i } = s;
        return this._client.post("/v1/user_profiles?beta=true", { body: i, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "user-profiles-2026-08-18"].toString(), ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      retrieve(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/user_profiles/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "user-profiles-2026-08-18"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      update(s, e, t) {
        let { betas: n, workspace_id: i, ...o } = e;
        return this._client.post(h`/v1/user_profiles/${s}?beta=true`, { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "user-profiles-2026-08-18"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { betas: t, workspace_id: n, ...i } = s ?? {};
        return this._client.getAPIList("/v1/user_profiles?beta=true", S, { query: i, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "user-profiles-2026-08-18"].toString(), ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      createEnrollmentURL(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.post(h`/v1/user_profiles/${s}/enrollment_url?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "user-profiles-2026-08-18"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
    };
    Go = qa(Yo(), 1);
    dt = class extends w {
      parseUnverified(s) {
        return JSON.parse(s);
      }
      unwrap(s, e) {
        let t = e?.headers;
        if (t == null) throw new Error("Webhook headers are required in order to verify the signature");
        let n = e.key === void 0 ? this._client.webhookKey : e.key;
        if (!n) throw new Error("Webhook key must not be null or empty in order to unwrap");
        return new Go.Webhook(n).verify(s, t), JSON.parse(s);
      }
    };
    ht = class extends w {
      list(s, e = {}, t) {
        let { betas: n, workspace_id: i, ...o } = e ?? {};
        return this._client.getAPIList(h`/v1/agents/${s}/versions?beta=true`, S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
    };
    vn = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.versions = new ht(this._client);
        }
        create(e, t) {
          let { betas: n, workspace_id: i, ...o } = e;
          return this._client.post("/v1/agents?beta=true", { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        retrieve(e, t = {}, n) {
          let { betas: i, workspace_id: o, ...c } = t ?? {};
          return this._client.get(h`/v1/agents/${e}?beta=true`, { query: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        update(e, t, n) {
          let { betas: i, workspace_id: o, ...c } = t;
          return this._client.post(h`/v1/agents/${e}?beta=true`, { body: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, workspace_id: i, ...o } = e ?? {};
          return this._client.getAPIList("/v1/agents?beta=true", S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        archive(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.post(h`/v1/agents/${e}/archive?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
      }
      return r.Versions = ht, r;
    })();
    L();
    L();
    L();
    Xc = 999;
    Qc = 1e3;
    Zc = 6e4;
    el = 3e5;
    Ar = (() => {
      class r {
        constructor(e) {
          ft.set(this, void 0), Pn.set(this, false), le.set(this, void 0), In.set(this, void 0), Tn.set(this, void 0), Mn.set(this, void 0), Sr.set(this, void 0), xr.set(this, void 0), pt.set(this, void 0), this.client = e.client, this.environmentId = e.environmentId, this.environmentKey = e.environmentKey, this.workerId = e.workerId ?? nl(), _(this, ft, En(e.client, { authToken: e.environmentKey, helper: "environments-work-poller" }), "f"), _(this, Tn, e.autoStop ?? true, "f"), _(this, Mn, e.drain ?? false, "f"), _(this, Sr, e.blockMs === void 0 ? Xc : e.blockMs, "f"), _(this, xr, e.reclaimOlderThanMs ?? null, "f"), _(this, pt, e.requestOptions, "f"), _(this, le, new AbortController(), "f"), _(this, In, Pe(e.signal, a(this, le, "f")), "f");
        }
        get signal() {
          return a(this, le, "f").signal;
        }
        abort() {
          a(this, le, "f").abort();
        }
        async *[(ft = /* @__PURE__ */ new WeakMap(), Pn = /* @__PURE__ */ new WeakMap(), le = /* @__PURE__ */ new WeakMap(), In = /* @__PURE__ */ new WeakMap(), Tn = /* @__PURE__ */ new WeakMap(), Mn = /* @__PURE__ */ new WeakMap(), Sr = /* @__PURE__ */ new WeakMap(), xr = /* @__PURE__ */ new WeakMap(), pt = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
          if (a(this, Pn, "f")) throw new y("Cannot iterate over a consumed WorkPoller");
          _(this, Pn, true, "f");
          let e = T(this.client);
          e.info("poller starting", { component: "work-poller", environment_id: this.environmentId });
          let t = new rl(e, this.environmentId);
          try {
            let n = 0;
            for (; !a(this, le, "f").signal.aborted; ) {
              let i;
              try {
                i = await a(this, ft, "f").beta.environments.work.poll(this.environmentId, { "Anthropic-Worker-ID": this.workerId, ...a(this, Sr, "f") !== null ? { block_ms: a(this, Sr, "f") } : {}, ...a(this, xr, "f") !== null ? { reclaim_older_than_ms: a(this, xr, "f") } : {} }, { headers: l([a(this, pt, "f")?.headers]), signal: a(this, le, "f").signal });
              } catch (o) {
                if (a(this, le, "f").signal.aborted) return;
                if (qe(o)) throw e.error("poll failed permanently, stopping poller", { error: String(o) }), o;
                let c = Rn(tl(n));
                e.warn("poll failed, backing off", { error: String(o), backoff_ms: c }), n++, await fe(c, a(this, le, "f").signal);
                continue;
              }
              if (n = 0, i == null) {
                if (a(this, Mn, "f")) return;
                t.onEmptyPoll(), await fe(Xo(1e3, 3e3), a(this, le, "f").signal);
                continue;
              }
              t.onClaim(), e.info("claimed work", { component: "work-poller", environment_id: this.environmentId, work_id: i.id, work_type: i.data.type });
              try {
                await a(this, ft, "f").beta.environments.work.ack(i.id, { environment_id: i.environment_id }, { headers: l([a(this, pt, "f")?.headers]), signal: a(this, le, "f").signal });
              } catch (o) {
                e.error("ack failed", { work_id: i.id, error: String(o) });
                continue;
              }
              try {
                yield i;
              } finally {
                if (a(this, Tn, "f")) try {
                  await a(this, ft, "f").beta.environments.work.stop(i.id, { environment_id: i.environment_id }, { headers: l([a(this, pt, "f")?.headers]) });
                } catch (o) {
                  Ie(o, 409) || e.warn("stop failed", { work_id: i.id, error: String(o) });
                }
              }
            }
          } finally {
            a(this, In, "f").call(this);
          }
        }
      }
      return r;
    })();
    rl = (() => {
      class r {
        constructor(e, t) {
          mt.set(this, void 0), On.set(this, void 0), _t.set(this, void 0), vr.set(this, 0), _(this, mt, e, "f"), _(this, On, t, "f");
        }
        onEmptyPoll() {
          let e = Date.now(), t = { component: "work-poller", environment_id: a(this, On, "f") };
          a(this, _t, "f") === void 0 ? (_(this, _t, _(this, vr, e, "f"), "f"), a(this, mt, "f").info("idle; polling for work", t)) : e - a(this, vr, "f") >= el ? (_(this, vr, e, "f"), a(this, mt, "f").info(`still polling; idle for ${Math.round((e - a(this, _t, "f")) / 1e3)}s`, t)) : a(this, mt, "f").debug("poll returned no work", t);
        }
        onClaim() {
          _(this, _t, void 0, "f");
        }
      }
      return mt = /* @__PURE__ */ new WeakMap(), On = /* @__PURE__ */ new WeakMap(), _t = /* @__PURE__ */ new WeakMap(), vr = /* @__PURE__ */ new WeakMap(), r;
    })();
    L();
    L();
    Qo = (() => {
      class r {
        constructor() {
          gt.set(this, []), Te.set(this, []), wt.set(this, false);
        }
        push(e) {
          if (a(this, wt, "f")) return false;
          let t = a(this, Te, "f").shift();
          return t ? t({ done: false, value: e }) : a(this, gt, "f").push(e), true;
        }
        close() {
          if (!a(this, wt, "f")) for (_(this, wt, true, "f"); a(this, Te, "f").length > 0; ) a(this, Te, "f").shift()({ done: true, value: void 0 });
        }
        next(e) {
          return a(this, gt, "f").length > 0 ? Promise.resolve({ done: false, value: a(this, gt, "f").shift() }) : a(this, wt, "f") || e?.aborted ? Promise.resolve({ done: true, value: void 0 }) : new Promise((t) => {
            let n = (o) => {
              e?.removeEventListener("abort", i), t(o);
            }, i = () => {
              let o = a(this, Te, "f").indexOf(n);
              o >= 0 && a(this, Te, "f").splice(o, 1), t({ done: true, value: void 0 });
            };
            a(this, Te, "f").push(n), e?.addEventListener("abort", i, { once: true });
          });
        }
        tryShift() {
          return a(this, gt, "f").shift();
        }
      }
      return gt = /* @__PURE__ */ new WeakMap(), Te = /* @__PURE__ */ new WeakMap(), wt = /* @__PURE__ */ new WeakMap(), r;
    })();
    bt = /* @__PURE__ */ (() => {
      class r extends Error {
        constructor(e) {
          let t = typeof e == "string" ? e : e.map((n) => n.type === "text" ? n.text : `[${n.type}]`).join(" ");
          super(t), this.name = "ToolError", this.content = e;
        }
      }
      return r;
    })();
    ia = 500;
    il = 1e4;
    ol = 12e4;
    al = 3e4;
    cl = 1e3;
    ll = 3e4;
    ul = 5 * 6e4;
    dl = 6e4;
    hl = (() => {
      class r {
        constructor(e, t) {
          Rr.set(this, void 0), Cn.set(this, void 0), yt.set(this, /* @__PURE__ */ new Set()), je.set(this, false), me.set(this, void 0), _(this, Rr, e, "f"), _(this, Cn, t, "f");
        }
        noteEvent(e) {
          e.type !== "user.tool_confirmation" && (ca(e) ? this.arm() : this.disarm());
        }
        block(e) {
          a(this, yt, "f").add(e), a(this, me, "f") !== void 0 && (_(this, je, true, "f"), clearTimeout(a(this, me, "f")), _(this, me, void 0, "f"));
        }
        unblock(e) {
          a(this, yt, "f").delete(e), a(this, yt, "f").size === 0 && a(this, je, "f") && this.arm();
        }
        arm() {
          if (!(a(this, Rr, "f") <= 0)) {
            if (a(this, yt, "f").size > 0) {
              _(this, je, true, "f");
              return;
            }
            _(this, je, false, "f"), a(this, me, "f") !== void 0 && clearTimeout(a(this, me, "f")), _(this, me, setTimeout(a(this, Cn, "f"), a(this, Rr, "f")), "f");
          }
        }
        disarm() {
          _(this, je, false, "f"), a(this, me, "f") !== void 0 && (clearTimeout(a(this, me, "f")), _(this, me, void 0, "f"));
        }
      }
      return Rr = /* @__PURE__ */ new WeakMap(), Cn = /* @__PURE__ */ new WeakMap(), yt = /* @__PURE__ */ new WeakMap(), je = /* @__PURE__ */ new WeakMap(), me = /* @__PURE__ */ new WeakMap(), r;
    })();
    Ir = (() => {
      class r {
        constructor(e, t) {
          B.add(this), $n.set(this, false), V.set(this, void 0), Nn.set(this, void 0), Er.set(this, void 0), Dn.set(this, void 0), z.set(this, void 0), St.set(this, /* @__PURE__ */ new Set()), se.set(this, /* @__PURE__ */ new Set()), xt.set(this, /* @__PURE__ */ new Map()), Me.set(this, /* @__PURE__ */ new Map()), kt.set(this, new Qo()), Re.set(this, 0), Bn.set(this, ul), Pr.set(this, null), ue.set(this, void 0), this.client = t.client, this.sessionId = e, this.tools = t.tools, this.maxIdleMs = t.maxIdleMs ?? dl, _(this, z, T(t.client), "f"), _(this, Dn, new Map(t.tools.map((n) => [ei(n), n])), "f"), _(this, V, new AbortController(), "f"), _(this, Nn, Pe(t.signal, a(this, V, "f")), "f"), _(this, Er, t.requestOptions, "f"), _(this, ue, new hl(this.maxIdleMs, () => {
            a(this, z, "f").info("session idle after end_turn; stopping", { component: "session-tool-runner", session_id: this.sessionId, max_idle_ms: this.maxIdleMs }), a(this, V, "f").abort();
          }), "f");
        }
        get signal() {
          return a(this, V, "f").signal;
        }
        abort() {
          a(this, V, "f").abort();
        }
        _setSendRetryWindow(e) {
          _(this, Bn, e, "f");
        }
        async *[($n = /* @__PURE__ */ new WeakMap(), V = /* @__PURE__ */ new WeakMap(), Nn = /* @__PURE__ */ new WeakMap(), Er = /* @__PURE__ */ new WeakMap(), Dn = /* @__PURE__ */ new WeakMap(), z = /* @__PURE__ */ new WeakMap(), St = /* @__PURE__ */ new WeakMap(), se = /* @__PURE__ */ new WeakMap(), xt = /* @__PURE__ */ new WeakMap(), Me = /* @__PURE__ */ new WeakMap(), kt = /* @__PURE__ */ new WeakMap(), Re = /* @__PURE__ */ new WeakMap(), Bn = /* @__PURE__ */ new WeakMap(), Pr = /* @__PURE__ */ new WeakMap(), ue = /* @__PURE__ */ new WeakMap(), B = /* @__PURE__ */ new WeakSet(), Symbol.asyncIterator)]() {
          if (a(this, $n, "f")) throw new y("Cannot iterate over a consumed SessionToolRunner");
          _(this, $n, true, "f"), a(this, z, "f").info("session tool runner starting", { component: "session-tool-runner", session_id: this.sessionId });
          let e = a(this, B, "m", oa).call(this).catch((t) => {
            a(this, V, "f").signal.aborted || a(this, z, "f").error("stream loop failed", { error: String(t) }), a(this, V, "f").abort();
          });
          try {
            for (; ; ) {
              let n = await a(this, kt, "f").next(a(this, V, "f").signal);
              if (n.done) break;
              yield n.value;
            }
            await e;
            let t;
            for (; (t = a(this, kt, "f").tryShift()) !== void 0; ) yield t;
          } finally {
            a(this, V, "f").abort(), a(this, ue, "f").disarm(), await e;
            try {
              await a(this, B, "m", aa).call(this);
            } catch (t) {
              a(this, z, "f").warn("drain failed", { error: String(t) });
            }
            a(this, kt, "f").close();
            for (let t of this.tools) try {
              await t.close?.();
            } catch (n) {
              a(this, z, "f").warn("tool.close failed", { tool: ei(t), error: String(n) });
            }
            a(this, Nn, "f").call(this);
          }
        }
      }
      return r;
    })();
    Ln = function() {
      return { ...a(this, Er, "f"), headers: l([yr("session-tool-runner"), a(this, Er, "f")?.headers]), signal: a(this, V, "f").signal };
    }, oa = async function() {
      let s = a(this, V, "f"), e = ia;
      for (; !s.signal.aborted; ) {
        try {
          let t = await this.client.beta.sessions.events.stream(this.sessionId, {}, a(this, B, "m", Ln).call(this));
          await a(this, B, "m", ea).call(this);
          for await (let n of t) if (e = ia, await a(this, B, "m", ra).call(this, n)) return;
        } catch (t) {
          if (s.signal.throwIfAborted(), qe(t)) throw a(this, z, "f").error("permanent stream failure, shutting down", { error: String(t) }), s.abort(), t;
          a(this, z, "f").warn("stream disconnected, reconnecting", { error: String(t), backoff_ms: e });
        }
        s.signal.throwIfAborted(), await fe(e, s.signal), e = Math.min(e * 2, il);
      }
    }, ea = async function() {
      let s = a(this, V, "f"), e = [], t = false;
      try {
        for await (let o of this.client.beta.sessions.events.list(this.sessionId, { limit: 1e3 }, a(this, B, "m", Ln).call(this))) a(this, B, "m", ta).call(this, o, e), t = ca(o);
      } catch (o) {
        s.signal.throwIfAborted(), a(this, z, "f").warn("reconcile list failed", { error: String(o) });
        for (let c of e) a(this, St, "f").delete(c.id);
        return;
      }
      let n = e.filter((o) => !a(this, se, "f").has(o.id));
      a(this, ue, "f").disarm();
      for (let o of n) await a(this, B, "m", ti).call(this, o);
      for (let o of [...a(this, Me, "f").values()]) {
        let c = a(this, xt, "f").get(o.id);
        c !== void 0 && await a(this, B, "m", Fn).call(this, o, c);
      }
      let i = n.filter((o) => !a(this, se, "f").has(o.id) && !a(this, Me, "f").has(o.id));
      t && i.length === 0 ? a(this, ue, "f").arm() : a(this, ue, "f").disarm();
    }, ta = function(s, e) {
      s.type === "agent.tool_use" || s.type === "agent.custom_tool_use" ? (a(this, St, "f").add(s.id), a(this, se, "f").has(s.id) || e.push(s)) : s.type === "user.tool_result" ? a(this, se, "f").add(s.tool_use_id) : s.type === "user.custom_tool_result" ? a(this, se, "f").add(s.custom_tool_use_id) : s.type === "user.tool_confirmation" && (a(this, se, "f").has(s.tool_use_id) || a(this, xt, "f").set(s.tool_use_id, s.result));
    }, ra = async function(s) {
      switch (a(this, ue, "f").noteEvent(s), s.type) {
        case "agent.tool_use":
        case "agent.custom_tool_use":
          return a(this, St, "f").has(s.id) || (a(this, St, "f").add(s.id), await a(this, B, "m", ti).call(this, s)), false;
        case "user.tool_confirmation":
          return await a(this, B, "m", na).call(this, s), false;
        case "user.tool_result":
          return a(this, se, "f").add(s.tool_use_id), false;
        case "user.custom_tool_result":
          return a(this, se, "f").add(s.custom_tool_use_id), false;
        case "session.status_terminated":
        case "session.deleted":
          return a(this, z, "f").info("session terminated", { component: "session-tool-runner", session_id: this.sessionId }), a(this, V, "f").abort(), true;
        default:
          return false;
      }
    }, ti = async function(s) {
      let e = s.evaluated_permission, t = e === "deny" ? "deny" : a(this, xt, "f").get(s.id);
      if (t === void 0) {
        e === void 0 || e === "allow" ? await a(this, B, "m", ri).call(this, s, void 0) : a(this, Me, "f").has(s.id) || (a(this, z, "f").info("tool call awaiting confirmation; holding", { component: "session-tool-runner", session_id: this.sessionId, tool: s.name, tool_use_id: s.id }), a(this, Me, "f").set(s.id, s), a(this, ue, "f").block(s.id));
        return;
      }
      await a(this, B, "m", Fn).call(this, s, t);
    }, na = async function(s) {
      a(this, xt, "f").set(s.tool_use_id, s.result);
      let e = a(this, Me, "f").get(s.tool_use_id);
      e !== void 0 && await a(this, B, "m", Fn).call(this, e, s.result);
    }, Fn = async function(s, e) {
      let t = a(this, Me, "f").delete(s.id);
      if (e === "allow") {
        a(this, z, "f").info("tool call confirmed", { component: "session-tool-runner", session_id: this.sessionId, tool: s.name, tool_use_id: s.id }), t || a(this, ue, "f").block(s.id);
        try {
          await a(this, B, "m", ri).call(this, s, "allow");
        } finally {
          a(this, ue, "f").unblock(s.id);
        }
        return;
      }
      t && a(this, ue, "f").unblock(s.id), a(this, se, "f").add(s.id), a(this, z, "f").info("tool call denied; not executing", { component: "session-tool-runner", session_id: this.sessionId, tool: s.name, tool_use_id: s.id }), a(this, B, "m", Hn).call(this, { event: s, toolUseId: s.id, name: s.name, isError: false, posted: false, confirmation: "deny" });
    }, Hn = function(s) {
      a(this, kt, "f").push(s);
    }, ri = async function(s, e) {
      var t, n;
      if (!a(this, se, "f").has(s.id)) {
        a(this, z, "f").info("executing tool", { component: "session-tool-runner", session_id: this.sessionId, tool: s.name, tool_use_id: s.id }), _(this, Re, (t = a(this, Re, "f"), t++, t), "f");
        try {
          let i = a(this, Dn, "f").get(s.name);
          if (!i) {
            a(this, z, "f").info("tool not owned by this runner; leaving the tool_use_id pending for its owner", { component: "session-tool-runner", session_id: this.sessionId, tool: s.name, tool_use_id: s.id }), a(this, B, "m", Hn).call(this, { event: s, toolUseId: s.id, name: s.name, isError: false, posted: false, confirmation: e });
            return;
          }
          let o, c, d = new AbortController(), u = Pe(a(this, V, "f").signal, d), p = setTimeout(() => d.abort(), ol);
          try {
            let b = await Zo(i, s.input, { toolUse: s, toolUseBlock: s, signal: d.signal });
            o = b.content, c = b.isError;
          } finally {
            clearTimeout(p), u();
          }
          let f = fl(s, c, pl(o)), m = await a(this, B, "m", sa).call(this, f, s.id);
          a(this, B, "m", Hn).call(this, { event: s, result: f, toolUseId: s.id, name: s.name, isError: c, posted: m, confirmation: e });
        } finally {
          _(this, Re, (n = a(this, Re, "f"), n--, n), "f"), a(this, Re, "f") === 0 && a(this, Pr, "f")?.call(this);
        }
      }
    }, sa = async function(s, e) {
      let t = a(this, V, "f"), n = Date.now(), i, o = 0;
      for (; ; ) {
        o++, t.signal.throwIfAborted();
        try {
          return await this.client.beta.sessions.events.send(this.sessionId, { events: [s] }, a(this, B, "m", Ln).call(this)), a(this, se, "f").add(e), true;
        } catch (c) {
          if (i = c, qe(c)) break;
          let d = a(this, Bn, "f") - (Date.now() - n);
          if (d <= 0) break;
          let u = Math.min(Rn(An(o - 1, cl, ll)), d);
          a(this, z, "f").warn("tool result send failed; retrying", { tool_use_id: e, attempt: o, backoff_ms: u, error: String(c) }), await fe(u, t.signal);
        }
      }
      return a(this, z, "f").error("failed to send tool result", { tool_use_id: e, attempts: o, error: String(i) }), false;
    }, aa = async function() {
      a(this, Re, "f") !== 0 && (await Promise.race([new Promise((s) => _(this, Pr, s, "f")), fe(al)]), _(this, Pr, null, "f"), a(this, Re, "f") > 0 && a(this, z, "f").warn("drain timeout exceeded"));
    };
    ni();
    fa = 3e4;
    El = 9e4;
    Pl = "NO_HEARTBEAT";
    li = (() => {
      class r {
        constructor(e) {
          if (Un.add(this), Tr.set(this, void 0), e.unrestrictedPaths !== void 0) throw new y("The `unrestrictedPaths` option you passed to EnvironmentWorker (or client.beta.environments.work.worker()) is no longer supported. The worker's file tools (read, write, edit, glob, grep) are now always confined to `workdir` plus the session's memory folders. Remove `unrestrictedPaths` from your options; to let the file tools reach any other directory, add it to `AgentToolContext.allowedRoots` from a `tools` factory.");
          this.client = e.client, this.environmentId = e.environmentId, this.environmentKey = e.environmentKey, this.tools = e.tools, this.workdir = e.workdir ?? process.cwd(), this.maxFileBytes = e.maxFileBytes, this.maxIdleMs = e.maxIdleMs, e.memorySyncIntervalMs != null && ua(e.memorySyncIntervalMs, "memorySyncIntervalMs"), this.memorySyncIntervalMs = e.memorySyncIntervalMs, this.memorySyncDeletions = e.memorySyncDeletions ?? "enabled", this.workerId = e.workerId, this.requestOptions = e.requestOptions, _(this, Tr, e.signal, "f");
        }
        async run(e) {
          let { environmentId: t, environmentKey: n } = this;
          if (t === void 0 || n === void 0) throw new y("EnvironmentWorker.run: environmentId and environmentKey are required to poll for work");
          let i = e ?? a(this, Tr, "f"), o = new Ar({ client: this.client, environmentId: t, environmentKey: n, ...this.workerId !== void 0 ? { workerId: this.workerId } : {}, ...i ? { signal: i } : {}, ...this.requestOptions !== void 0 ? { requestOptions: this.requestOptions } : {}, autoStop: false });
          for await (let c of o) try {
            await a(this, Un, "m", ci).call(this, c, n, o.signal);
          } catch (d) {
            if (o.signal?.aborted) throw d;
            T(this.client).error("work item failed", { work_id: c.id, error: String(d) });
          }
        }
        async handleItem(e) {
          let t = e?.workId ?? P("ANTHROPIC_WORK_ID"), n = e?.environmentId ?? P("ANTHROPIC_ENVIRONMENT_ID"), i = e?.sessionId ?? P("ANTHROPIC_SESSION_ID"), o = (e?.environmentKey ?? this.environmentKey ?? P("ANTHROPIC_ENVIRONMENT_KEY")) || void 0, c = e?.workSecret || P("ANTHROPIC_WORK_SECRET") || null;
          if (!t) throw new y("handleItem: workId is required \u2014 pass it or set ANTHROPIC_WORK_ID");
          if (!n) throw new y("handleItem: environmentId is required \u2014 pass it or set ANTHROPIC_ENVIRONMENT_ID");
          if (!i) throw new y("handleItem: sessionId is required \u2014 pass it or set ANTHROPIC_SESSION_ID");
          if (!o && !c) throw new y("handleItem: environmentKey is required when there is no work secret \u2014 pass it, construct the worker with it, or set ANTHROPIC_ENVIRONMENT_KEY");
          let d = { id: t, environment_id: n, secret: c, data: { type: "session", id: i } };
          await a(this, Un, "m", ci).call(this, d, o, e?.signal ?? a(this, Tr, "f"));
        }
      }
      return Tr = /* @__PURE__ */ new WeakMap(), Un = /* @__PURE__ */ new WeakSet(), ci = async function(e, t, n) {
        let i = T(this.client), o = Tl(e.secret), c = o ?? t;
        if (c === void 0) throw new y("handleItem: the work item carried a secret payload but no sessions token could be extracted, and there is no environment key to fall back to; the poller must issue a secret whose payload carries `sessions_token`, or provide the environment key (pass it, construct the worker with it, or set ANTHROPIC_ENVIRONMENT_KEY)");
        e.secret && o === null && i.warn("work item carried a secret payload but no sessions token could be extracted; falling back to the environment key", { work_id: e.id });
        let d = En(this.client, { authToken: c, helper: "environments-worker" }), u = e.data.id, p = new AbortController(), f = Pe(n, p), m = new Ol(p), b = await Promise.resolve().then(() => (ha(), da)), g, x, A = $l(d, e, m, i, this.requestOptions, (v) => {
          g = v, x?._setSendRetryWindow(v);
        }).catch((v) => {
          p.signal.aborted || i.error("heartbeat loop failed", { work_id: e.id, error: String(v) }), p.abort();
        }), E = async () => {
        }, k, I = false;
        try {
          if (e.data.type !== "session") {
            i.debug("skipping non-session work item", { work_id: e.id, type: e.data.type });
            return;
          }
          let v = await d.beta.sessions.retrieve(u);
          if (o === null && this.memorySyncIntervalMs !== null && Il(v)) throw new b.SessionMemoryError(`cannot mount the session's memories: the work item carried no sessions token (work_id=${e.id}, session_id=${u}); the memory endpoints reject the environment key, so the poller must issue a per-item \`secret\` carrying \`sessions_token\`, or set \`memorySyncIntervalMs: null\` to run without memory`);
          let R = { workdir: this.workdir, client: d, session: v, ...this.maxFileBytes !== void 0 ? { maxFileBytes: this.maxFileBytes } : {} };
          try {
            E = await b.setupSkills(R);
          } catch (M) {
            i.warn("skill setup failed", { session_id: u, work_id: e.id, error: String(M) });
          }
          o !== null && this.memorySyncIntervalMs !== null ? (k = new b.SessionMemoryStores(d, { workdir: this.workdir, ...this.memorySyncIntervalMs !== void 0 ? { syncIntervalMs: this.memorySyncIntervalMs } : {}, syncDeletions: this.memorySyncDeletions }), await k.download(v), R.allowedRoots = k.roots, R.readOnlyRoots = k.readOnlyRoots) : i.debug("memory stores disabled for this item", { work_id: e.id });
          let $ = typeof this.tools == "function" ? this.tools(R) : this.tools ?? b.betaAgentToolset20260401(R);
          x = new Ir(u, { client: d, tools: $, ...this.maxIdleMs !== void 0 ? { maxIdleMs: this.maxIdleMs } : {}, ...this.requestOptions !== void 0 ? { requestOptions: this.requestOptions } : {}, signal: p.signal }), g !== void 0 && x._setSendRetryWindow(g);
          for await (let M of x) k && await k.syncIfDue();
          I = !p.signal.aborted;
        } finally {
          try {
            await E().catch((v) => {
              i.warn("skill cleanup failed", { session_id: u, work_id: e.id, error: String(v) });
            });
          } finally {
            if (k) {
              let v = b.MEMORY_FLUSH_TIMEOUT_MS;
              I && await pa(k.finish(), v) && i.warn(`final memory sync cut off after ${v}ms; the flush that follows still uploads changed files`, { session_id: u, work_id: e.id });
              let R = new AbortController();
              await pa(k.flushWrites(R.signal), v) && (R.abort(), i.warn(`memory flush cut off after ${v}ms; changed files it had not uploaded yet are not saved`, { session_id: u, work_id: e.id })), await k.dispose().catch((M) => {
                i.warn("memory store cleanup failed", { session_id: u, work_id: e.id, error: String(M) });
              });
            }
          }
          m.finish("runner_done"), f(), await A, m.lost ? i.info("lease lost; released without stopping it", { session_id: u, work_id: e.id }) : await Ml(d, e, i, this.requestOptions);
        }
      }, r;
    })();
    Ol = (() => {
      class r {
        constructor(e) {
          Mr.set(this, void 0), vt.set(this, void 0), _(this, Mr, e, "f");
        }
        get signal() {
          return a(this, Mr, "f").signal;
        }
        finish(e) {
          _(this, vt, a(this, vt, "f") ?? e, "f"), a(this, Mr, "f").abort();
        }
        get lost() {
          return a(this, vt, "f") === "lease_lost" || a(this, vt, "f") === "assumed_lost";
        }
      }
      return Mr = /* @__PURE__ */ new WeakMap(), vt = /* @__PURE__ */ new WeakMap(), r;
    })();
    qn = (() => {
      class r extends w {
        retrieve(e, t, n) {
          let { environment_id: i, betas: o, workspace_id: c } = t;
          return this._client.get(h`/v1/environments/${i}/work/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...o ?? [], "managed-agents-2026-04-01"].toString(), ...c != null ? { "anthropic-workspace-id": c } : void 0 }, n?.headers]) });
        }
        update(e, t, n) {
          let { environment_id: i, betas: o, workspace_id: c, ...d } = t;
          return this._client.post(h`/v1/environments/${i}/work/${e}?beta=true`, { body: d, ...n, headers: l([{ "anthropic-beta": [...o ?? [], "managed-agents-2026-04-01"].toString(), ...c != null ? { "anthropic-workspace-id": c } : void 0 }, n?.headers]) });
        }
        list(e, t = {}, n) {
          let { betas: i, ...o } = t ?? {};
          return this._client.getAPIList(h`/v1/environments/${e}/work?beta=true`, S, { query: o, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString() }, n?.headers]) });
        }
        ack(e, t, n) {
          let { environment_id: i, betas: o } = t;
          return this._client.post(h`/v1/environments/${i}/work/${e}/ack?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...o ?? [], "managed-agents-2026-04-01"].toString() }, n?.headers]) });
        }
        heartbeat(e, t, n) {
          let { environment_id: i, desired_ttl_seconds: o, expected_last_heartbeat: c, betas: d } = t;
          return this._client.post(h`/v1/environments/${i}/work/${e}/heartbeat?beta=true`, { query: { desired_ttl_seconds: o, expected_last_heartbeat: c }, ...n, headers: l([{ "anthropic-beta": [...d ?? [], "managed-agents-2026-04-01"].toString() }, n?.headers]) });
        }
        poll(e, t = {}, n) {
          let { betas: i, "Anthropic-Worker-ID": o, ...c } = t ?? {};
          return this._client.get(h`/v1/environments/${e}/work/poll?beta=true`, { query: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "Anthropic-Worker-ID": o } : void 0 }, n?.headers]) });
        }
        stats(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.get(h`/v1/environments/${e}/work/stats?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        stop(e, t, n) {
          let { environment_id: i, betas: o, workspace_id: c, ...d } = t;
          return this._client.post(h`/v1/environments/${i}/work/${e}/stop?beta=true`, { body: d, ...n, headers: l([{ "anthropic-beta": [...o ?? [], "managed-agents-2026-04-01"].toString(), ...c != null ? { "anthropic-workspace-id": c } : void 0 }, n?.headers]) });
        }
        poller(e) {
          return new Ar({ ...e, client: this._client });
        }
        worker(e) {
          return new li({ ...e, client: this._client });
        }
      }
      return r.WorkPoller = Ar, r.EnvironmentWorker = li, r;
    })();
    jn = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.work = new qn(this._client);
        }
        create(e, t) {
          let { betas: n, workspace_id: i, ...o } = e;
          return this._client.post("/v1/environments?beta=true", { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        retrieve(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.get(h`/v1/environments/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        update(e, t, n) {
          let { betas: i, workspace_id: o, ...c } = t;
          return this._client.post(h`/v1/environments/${e}?beta=true`, { body: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, workspace_id: i, ...o } = e ?? {};
          return this._client.getAPIList("/v1/environments?beta=true", S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        delete(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.delete(h`/v1/environments/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        archive(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.post(h`/v1/environments/${e}/archive?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
      }
      return r.Work = qn, r;
    })();
    At = class extends w {
      create(s, e, t) {
        let { view: n, betas: i, workspace_id: o, ...c } = e;
        return this._client.post(h`/v1/memory_stores/${s}/memories?beta=true`, { query: { view: n }, body: c, ...t, headers: l([{ "anthropic-beta": [...i ?? [], "agent-memory-2026-07-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      retrieve(s, e, t) {
        let { memory_store_id: n, betas: i, workspace_id: o, ...c } = e;
        return this._client.get(h`/v1/memory_stores/${n}/memories/${s}?beta=true`, { query: c, ...t, headers: l([{ "anthropic-beta": [...i ?? [], "agent-memory-2026-07-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      update(s, e, t) {
        let { memory_store_id: n, view: i, betas: o, workspace_id: c, ...d } = e;
        return this._client.post(h`/v1/memory_stores/${n}/memories/${s}?beta=true`, { query: { view: i }, body: d, ...t, headers: l([{ "anthropic-beta": [...o ?? [], "agent-memory-2026-07-22"].toString(), ...c != null ? { "anthropic-workspace-id": c } : void 0 }, t?.headers]) });
      }
      list(s, e = {}, t) {
        let { betas: n, workspace_id: i, ...o } = e ?? {};
        return this._client.getAPIList(h`/v1/memory_stores/${s}/memories?beta=true`, S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "agent-memory-2026-07-22"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      delete(s, e, t) {
        let { memory_store_id: n, expected_content_sha256: i, betas: o, workspace_id: c } = e;
        return this._client.delete(h`/v1/memory_stores/${n}/memories/${s}?beta=true`, { query: { expected_content_sha256: i }, ...t, headers: l([{ "anthropic-beta": [...o ?? [], "agent-memory-2026-07-22"].toString(), ...c != null ? { "anthropic-workspace-id": c } : void 0 }, t?.headers]) });
      }
    };
    Rt = class extends w {
      retrieve(s, e, t) {
        let { memory_store_id: n, betas: i, workspace_id: o, ...c } = e;
        return this._client.get(h`/v1/memory_stores/${n}/memory_versions/${s}?beta=true`, { query: c, ...t, headers: l([{ "anthropic-beta": [...i ?? [], "agent-memory-2026-07-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      list(s, e = {}, t) {
        let { betas: n, workspace_id: i, ...o } = e ?? {};
        return this._client.getAPIList(h`/v1/memory_stores/${s}/memory_versions?beta=true`, S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "agent-memory-2026-07-22"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      redact(s, e, t) {
        let { memory_store_id: n, betas: i, workspace_id: o } = e;
        return this._client.post(h`/v1/memory_stores/${n}/memory_versions/${s}/redact?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "agent-memory-2026-07-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
    };
    zn = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.memories = new At(this._client), this.memoryVersions = new Rt(this._client);
        }
        create(e, t) {
          let { betas: n, workspace_id: i, ...o } = e;
          return this._client.post("/v1/memory_stores?beta=true", { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "agent-memory-2026-07-22"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        retrieve(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.get(h`/v1/memory_stores/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "agent-memory-2026-07-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        update(e, t, n) {
          let { betas: i, workspace_id: o, ...c } = t;
          return this._client.post(h`/v1/memory_stores/${e}?beta=true`, { body: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "agent-memory-2026-07-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, workspace_id: i, ...o } = e ?? {};
          return this._client.getAPIList("/v1/memory_stores?beta=true", S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "agent-memory-2026-07-22"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        delete(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.delete(h`/v1/memory_stores/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "agent-memory-2026-07-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        archive(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.post(h`/v1/memory_stores/${e}/archive?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "agent-memory-2026-07-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
      }
      return r.Memories = At, r.MemoryVersions = Rt, r;
    })();
    L();
    Kn = /* @__PURE__ */ (() => {
      class r {
        constructor(e, t) {
          this.iterator = e, this.controller = t;
        }
        async *decoder() {
          let e = new pr();
          for await (let t of this.iterator) for (let n of e.decode(t)) yield JSON.parse(n);
          for (let t of e.flush()) yield JSON.parse(t);
        }
        [Symbol.asyncIterator]() {
          return this.decoder();
        }
        static fromResponse(e, t) {
          if (!e.body) throw t.abort(), typeof globalThis.navigator < "u" && globalThis.navigator.product === "ReactNative" ? new y("The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api") : new y("Attempted to iterate over a response with no body");
          return new r(ur(e.body), t);
        }
      }
      return r;
    })();
    Et = class extends w {
      create(s, e) {
        let { betas: t, user_profile_id: n, workspace_id: i, ...o } = s;
        return this._client.post("/v1/messages/batches?beta=true", { body: o, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "message-batches-2024-09-24"].toString(), ...n != null ? { "anthropic-user-profile-id": n } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, e?.headers]) });
      }
      retrieve(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/messages/batches/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "message-batches-2024-09-24"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { betas: t, workspace_id: n, ...i } = s ?? {};
        return this._client.getAPIList("/v1/messages/batches?beta=true", q, { query: i, ...e, headers: l([{ "anthropic-beta": [...t ?? [], "message-batches-2024-09-24"].toString(), ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      delete(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.delete(h`/v1/messages/batches/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "message-batches-2024-09-24"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      cancel(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.post(h`/v1/messages/batches/${s}/cancel?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...n ?? [], "message-batches-2024-09-24"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      async results(s, e = {}, t) {
        let n = await this.retrieve(s, e, t);
        if (!n.results_url) throw new y(`No batch \`results_url\`; Has it finished processing? ${n.processing_status} - ${n.id}`);
        let { betas: i, workspace_id: o } = e ?? {};
        return this._client.get(n.results_url, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "message-batches-2024-09-24"].toString(), Accept: "application/binary", ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]), stream: true, __binaryResponse: true })._thenUnwrap((c, d) => Kn.fromResponse(d.response, d.controller));
      }
    };
    Vn = { "claude-opus-4@20250514": 8192, "anthropic.claude-opus-4-1-20250805-v1:0": 8192, "claude-opus-4-1@20250805": 8192 };
    L();
    He();
    Ul = (r) => {
      let s = 0, e = [];
      for (; s < r.length; ) {
        let t = r[s];
        if (t === "\\") {
          s++;
          continue;
        }
        if (t === "{") {
          e.push({ type: "brace", value: "{" }), s++;
          continue;
        }
        if (t === "}") {
          e.push({ type: "brace", value: "}" }), s++;
          continue;
        }
        if (t === "[") {
          e.push({ type: "paren", value: "[" }), s++;
          continue;
        }
        if (t === "]") {
          e.push({ type: "paren", value: "]" }), s++;
          continue;
        }
        if (t === ":") {
          e.push({ type: "separator", value: ":" }), s++;
          continue;
        }
        if (t === ",") {
          e.push({ type: "delimiter", value: "," }), s++;
          continue;
        }
        if (t === '"') {
          let c = "", d = false;
          for (t = r[++s]; t !== '"'; ) {
            if (s === r.length) {
              d = true;
              break;
            }
            if (t === "\\") {
              if (s++, s === r.length) {
                d = true;
                break;
              }
              c += t + r[s], t = r[++s];
            } else c += t, t = r[++s];
          }
          t = r[++s], d || e.push({ type: "string", value: c });
          continue;
        }
        if (t && /\s/.test(t)) {
          s++;
          continue;
        }
        let i = /[0-9]/;
        if (t && i.test(t) || t === "-" || t === ".") {
          let c = "";
          for (t === "-" && (c += t, t = r[++s]); t && (i.test(t) || t === "." || t === "e" || t === "E" || (t === "-" || t === "+") && (c[c.length - 1] === "e" || c[c.length - 1] === "E")); ) c += t, t = r[++s];
          e.push({ type: "number", value: c });
          continue;
        }
        let o = /[a-z]/i;
        if (t && o.test(t)) {
          let c = "";
          for (; t && o.test(t) && s !== r.length; ) c += t, t = r[++s];
          if (c == "true" || c == "false" || c === "null") e.push({ type: "name", value: c });
          else {
            s++;
            continue;
          }
          continue;
        }
        s++;
      }
      return e;
    };
    Pt = (r) => {
      if (r.length === 0) return r;
      let s = r[r.length - 1];
      switch (s.type) {
        case "separator":
          return r = r.slice(0, r.length - 1), Pt(r);
          break;
        case "number":
          let e = s.value[s.value.length - 1];
          if (e === "." || e === "-" || e === "+" || e === "e" || e === "E") return r = r.slice(0, r.length - 1), Pt(r);
        case "string":
          let t = r[r.length - 2];
          if (t?.type === "delimiter") return r = r.slice(0, r.length - 1), Pt(r);
          if (t?.type === "brace" && t.value === "{") return r = r.slice(0, r.length - 1), Pt(r);
          break;
        case "delimiter":
          return r = r.slice(0, r.length - 1), Pt(r);
          break;
      }
      return r;
    };
    ql = (r) => {
      let s = [];
      return r.map((e) => {
        e.type === "brace" && (e.value === "{" ? s.push("}") : s.splice(s.lastIndexOf("}"), 1)), e.type === "paren" && (e.value === "[" ? s.push("]") : s.splice(s.lastIndexOf("]"), 1));
      }), s.length > 0 && s.reverse().map((e) => {
        e === "}" ? r.push({ type: "brace", value: "}" }) : e === "]" && r.push({ type: "paren", value: "]" });
      }), r;
    };
    jl = (r) => {
      let s = "";
      return r.map((e) => {
        e.type === "string" ? s += '"' + e.value + '"' : s += e.value;
      }), s;
    };
    _a = (r) => JSON.parse(jl(ql(Pt(Ul(r)))));
    Oe = "__json_buf";
    ba = (() => {
      class r {
        constructor(e, t) {
          Z.add(this), this.messages = [], this.receivedMessages = [], Ce.set(this, void 0), It.set(this, null), this.controller = new AbortController(), Or.set(this, void 0), Yn.set(this, () => {
          }), Cr.set(this, () => {
          }), $r.set(this, void 0), Gn.set(this, () => {
          }), Nr.set(this, () => {
          }), Se.set(this, {}), Lr.set(this, false), Xn.set(this, false), Qn.set(this, false), ze.set(this, false), Zn.set(this, void 0), es.set(this, void 0), ts.set(this, void 0), Fr.set(this, void 0), Hr.set(this, (n) => {
            if (_(this, Xn, true, "f"), he(n) && (n = new J()), n instanceof J) return _(this, Qn, true, "f"), this._emit("abort", n);
            if (n instanceof y) return this._emit("error", n);
            if (n instanceof Error) {
              let i = new y(n.message);
              return i.cause = n, this._emit("error", i);
            }
            return this._emit("error", new y(String(n)));
          }), _(this, Or, new Promise((n, i) => {
            _(this, Yn, n, "f"), _(this, Cr, i, "f");
          }), "f"), _(this, $r, new Promise((n, i) => {
            _(this, Gn, n, "f"), _(this, Nr, i, "f");
          }), "f"), a(this, Or, "f").catch(() => {
          }), a(this, $r, "f").catch(() => {
          }), _(this, It, e, "f"), _(this, Fr, t?.logger ?? console, "f");
        }
        get response() {
          return a(this, Zn, "f");
        }
        get request_id() {
          return a(this, es, "f");
        }
        get workspace_id() {
          return a(this, ts, "f");
        }
        async withResponse() {
          _(this, ze, true, "f");
          let e = await a(this, Or, "f");
          if (!e) throw new Error("Could not resolve a `Response` object");
          return { data: this, response: e, request_id: e.headers.get("request-id"), workspace_id: e.headers.get("anthropic-workspace-id") };
        }
        static fromReadableStream(e) {
          let t = new r(null);
          return t._run(() => t._fromReadableStream(e)), t;
        }
        static createMessage(e, t, n, { logger: i } = {}) {
          let o = new r(t, { logger: i });
          for (let c of t.messages) o._addMessageParam(c);
          return _(o, It, { ...t, stream: true }, "f"), o._run(() => o._createMessage(e, { ...t, stream: true }, { ...n, headers: { ...n?.headers, [bn]: "stream" } })), o;
        }
        _run(e) {
          e().then(() => {
            this._emitFinal(), this._emit("end");
          }, a(this, Hr, "f"));
        }
        _addMessageParam(e) {
          this.messages.push(e);
        }
        _addMessage(e, t = true) {
          this.receivedMessages.push(e), t && this._emit("message", e);
        }
        async _createMessage(e, t, n) {
          let i = n?.signal, o;
          i && (i.aborted && this.controller.abort(), o = this.controller.abort.bind(this.controller), i.addEventListener("abort", o));
          try {
            a(this, Z, "m", fi).call(this);
            let { response: c, data: d } = await e.create({ ...t, stream: true }, { ...n, signal: this.controller.signal }).withResponse();
            this._connected(c);
            for await (let u of d) a(this, Z, "m", pi).call(this, u);
            if (d.controller.signal?.aborted) throw new J();
            a(this, Z, "m", mi).call(this);
          } finally {
            i && o && i.removeEventListener("abort", o);
          }
        }
        _connected(e) {
          this.ended || (_(this, Zn, e, "f"), _(this, es, e?.headers.get("request-id"), "f"), _(this, ts, e?.headers.get("anthropic-workspace-id"), "f"), a(this, Yn, "f").call(this, e), this._emit("connect"));
        }
        get ended() {
          return a(this, Lr, "f");
        }
        get errored() {
          return a(this, Xn, "f");
        }
        get aborted() {
          return a(this, Qn, "f");
        }
        abort() {
          this.controller.abort();
        }
        on(e, t) {
          return (a(this, Se, "f")[e] || (a(this, Se, "f")[e] = [])).push({ listener: t }), this;
        }
        off(e, t) {
          let n = a(this, Se, "f")[e];
          if (!n) return this;
          let i = n.findIndex((o) => o.listener === t);
          return i >= 0 && n.splice(i, 1), this;
        }
        once(e, t) {
          return (a(this, Se, "f")[e] || (a(this, Se, "f")[e] = [])).push({ listener: t, once: true }), this;
        }
        emitted(e) {
          return new Promise((t, n) => {
            _(this, ze, true, "f"), e !== "error" && this.once("error", n), this.once(e, t);
          });
        }
        async done() {
          _(this, ze, true, "f"), await a(this, $r, "f");
        }
        get currentMessage() {
          return a(this, Ce, "f");
        }
        async finalMessage() {
          return await this.done(), a(this, Z, "m", hi).call(this);
        }
        async finalText() {
          return await this.done(), a(this, Z, "m", ga).call(this);
        }
        _emit(e, ...t) {
          if (a(this, Lr, "f")) return;
          e === "end" && (_(this, Lr, true, "f"), a(this, Gn, "f").call(this));
          let n = a(this, Se, "f")[e];
          if (n && (a(this, Se, "f")[e] = n.filter((i) => !i.once), n.forEach(({ listener: i }) => i(...t))), e === "abort") {
            let i = t[0];
            !a(this, ze, "f") && !n?.length && Promise.reject(i), a(this, Cr, "f").call(this, i), a(this, Nr, "f").call(this, i), this._emit("end");
            return;
          }
          if (e === "error") {
            let i = t[0];
            !a(this, ze, "f") && !n?.length && Promise.reject(i), a(this, Cr, "f").call(this, i), a(this, Nr, "f").call(this, i), this._emit("end");
          }
        }
        _emitFinal() {
          this.receivedMessages.at(-1) && this._emit("finalMessage", a(this, Z, "m", hi).call(this));
        }
        async _fromReadableStream(e, t) {
          let n = t?.signal, i;
          n && (n.aborted && this.controller.abort(), i = this.controller.abort.bind(this.controller), n.addEventListener("abort", i));
          try {
            a(this, Z, "m", fi).call(this), this._connected(null);
            let o = ke.fromReadableStream(e, this.controller);
            for await (let c of o) a(this, Z, "m", pi).call(this, c);
            if (o.controller.signal?.aborted) throw new J();
            a(this, Z, "m", mi).call(this);
          } finally {
            n && i && n.removeEventListener("abort", i);
          }
        }
        [(Ce = /* @__PURE__ */ new WeakMap(), It = /* @__PURE__ */ new WeakMap(), Or = /* @__PURE__ */ new WeakMap(), Yn = /* @__PURE__ */ new WeakMap(), Cr = /* @__PURE__ */ new WeakMap(), $r = /* @__PURE__ */ new WeakMap(), Gn = /* @__PURE__ */ new WeakMap(), Nr = /* @__PURE__ */ new WeakMap(), Se = /* @__PURE__ */ new WeakMap(), Lr = /* @__PURE__ */ new WeakMap(), Xn = /* @__PURE__ */ new WeakMap(), Qn = /* @__PURE__ */ new WeakMap(), ze = /* @__PURE__ */ new WeakMap(), Zn = /* @__PURE__ */ new WeakMap(), es = /* @__PURE__ */ new WeakMap(), ts = /* @__PURE__ */ new WeakMap(), Fr = /* @__PURE__ */ new WeakMap(), Hr = /* @__PURE__ */ new WeakMap(), Z = /* @__PURE__ */ new WeakSet(), hi = function() {
          if (this.receivedMessages.length === 0) throw new y("stream ended without producing a Message with role=assistant");
          return this.receivedMessages.at(-1);
        }, ga = function() {
          if (this.receivedMessages.length === 0) throw new y("stream ended without producing a Message with role=assistant");
          let t = this.receivedMessages.at(-1).content.filter((n) => n.type === "text").map((n) => n.text);
          if (t.length === 0) throw new y("stream ended without producing a content block with type=text");
          return t.join(" ");
        }, fi = function() {
          this.ended || _(this, Ce, void 0, "f");
        }, pi = function(t) {
          if (this.ended) return;
          let n = a(this, Z, "m", wa).call(this, t);
          switch (this._emit("streamEvent", t, n), t.type) {
            case "content_block_delta": {
              let i = n.content.at(-1);
              switch (t.delta.type) {
                case "text_delta": {
                  i.type === "text" && this._emit("text", t.delta.text, i.text || "");
                  break;
                }
                case "citations_delta": {
                  i.type === "text" && this._emit("citation", t.delta.citation, i.citations ?? []);
                  break;
                }
                case "input_json_delta": {
                  if (gi(i) && a(this, Se, "f").inputJson?.length) {
                    let o;
                    try {
                      o = i.input;
                    } catch (c) {
                      a(this, Hr, "f").call(this, a(this, Z, "m", _i).call(this, i, c));
                      break;
                    }
                    this._emit("inputJson", t.delta.partial_json, o);
                  }
                  break;
                }
                case "thinking_delta": {
                  i.type === "thinking" && this._emit("thinking", t.delta.thinking, i.thinking);
                  break;
                }
                case "signature_delta": {
                  i.type === "thinking" && this._emit("signature", i.signature);
                  break;
                }
                case "compaction_delta": {
                  i.type === "compaction" && i.content && this._emit("compaction", i.content);
                  break;
                }
                default:
                  t.delta;
              }
              break;
            }
            case "message_stop": {
              this._addMessageParam(n), this._addMessage(ui(n, a(this, It, "f"), { logger: a(this, Fr, "f") }), true);
              break;
            }
            case "content_block_stop": {
              this._emit("contentBlock", n.content.at(-1));
              break;
            }
            case "message_start": {
              _(this, Ce, n, "f");
              break;
            }
            case "content_block_start":
            case "message_delta":
              break;
          }
        }, mi = function() {
          if (this.ended) throw new y("stream has ended, this shouldn't happen");
          let t = a(this, Ce, "f");
          if (!t) throw new y("request ended without sending any chunks");
          return _(this, Ce, void 0, "f"), ui(t, a(this, It, "f"), { logger: a(this, Fr, "f") });
        }, wa = function(t) {
          let n = a(this, Ce, "f");
          if (t.type === "message_start") {
            if (n) throw new y(`Unexpected event order, got ${t.type} before receiving "message_stop"`);
            return t.message;
          }
          if (!n) throw new y(`Unexpected event order, got ${t.type} before "message_start"`);
          switch (t.type) {
            case "message_stop":
              return n;
            case "message_delta":
              return n.stop_reason = t.delta.stop_reason, n.stop_sequence = t.delta.stop_sequence, n.stop_details = t.delta.stop_details, n.usage.output_tokens = t.usage.output_tokens, t.delta.container != null && (n.container = t.delta.container), t.context_management != null && (n.context_management = t.context_management), t.input_transformations != null && (n.input_transformations = t.input_transformations), t.usage.input_tokens != null && (n.usage.input_tokens = t.usage.input_tokens), t.usage.cache_creation_input_tokens != null && (n.usage.cache_creation_input_tokens = t.usage.cache_creation_input_tokens), t.usage.cache_read_input_tokens != null && (n.usage.cache_read_input_tokens = t.usage.cache_read_input_tokens), t.usage.server_tool_use != null && (n.usage.server_tool_use = t.usage.server_tool_use), t.usage.iterations != null && (n.usage.iterations = t.usage.iterations), t.usage.fallback_credit != null && (n.usage.fallback_credit = t.usage.fallback_credit), t.usage.output_tokens_details != null && (n.usage.output_tokens_details = t.usage.output_tokens_details), n;
            case "content_block_start":
              return n.content.push(t.content_block), t.content_block.type === "fallback" && (n.model = t.content_block.to.model), n;
            case "content_block_delta": {
              let i = n.content.at(t.index);
              switch (t.delta.type) {
                case "text_delta": {
                  i?.type === "text" && (n.content[t.index] = { ...i, text: (i.text || "") + t.delta.text });
                  break;
                }
                case "citations_delta": {
                  i?.type === "text" && (n.content[t.index] = { ...i, citations: [...i.citations ?? [], t.delta.citation] });
                  break;
                }
                case "input_json_delta": {
                  if (i && gi(i)) {
                    let o = (i[Oe] || "") + t.delta.partial_json;
                    n.content[t.index] = Jn(i, o);
                  }
                  break;
                }
                case "thinking_delta": {
                  i?.type === "thinking" && (n.content[t.index] = { ...i, thinking: i.thinking + t.delta.thinking });
                  break;
                }
                case "signature_delta": {
                  i?.type === "thinking" && (n.content[t.index] = { ...i, signature: t.delta.signature });
                  break;
                }
                case "compaction_delta": {
                  if (i?.type === "compaction") {
                    let o = { ...i, content: t.delta.content };
                    "encrypted_content" in t.delta && (o.encrypted_content = t.delta.encrypted_content), n.content[t.index] = o;
                  }
                  break;
                }
                default:
                  t.delta;
              }
              return n;
            }
            case "content_block_stop": {
              let i = n.content.at(t.index);
              if (i && gi(i) && Oe in i) {
                let o;
                try {
                  o = i.input;
                } catch (c) {
                  o = {}, a(this, Hr, "f").call(this, a(this, Z, "m", _i).call(this, i, c));
                }
                Object.defineProperty(i, "input", { value: o, enumerable: true, configurable: true, writable: true });
              }
              return n;
            }
          }
        }, _i = function(t, n) {
          let i = t[Oe];
          return new y(`Unable to parse tool parameter JSON from model. Please retry your request or adjust your prompt. Error: ${n}. JSON: ${i}`);
        }, Symbol.asyncIterator)]() {
          let e = [], t = [], n = false;
          return this.on("streamEvent", (i) => {
            let o = t.shift();
            o ? o.resolve(i) : e.push(i);
          }), this.on("end", () => {
            n = true;
            for (let i of t) i.resolve(void 0);
            t.length = 0;
          }), this.on("abort", (i) => {
            n = true;
            for (let o of t) o.reject(i);
            t.length = 0;
          }), this.on("error", (i) => {
            n = true;
            for (let o of t) o.reject(i);
            t.length = 0;
          }), { next: async () => e.length ? { value: e.shift(), done: false } : n ? { value: void 0, done: true } : new Promise((o, c) => t.push({ resolve: o, reject: c })).then((o) => o ? { value: o, done: false } : { value: void 0, done: true }), return: async () => (this.abort(), { value: void 0, done: true }) };
        }
        toReadableStream() {
          return new ke(this[Symbol.asyncIterator].bind(this), this.controller).toReadableStream();
        }
      }
      return r;
    })();
    L();
    ya = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:
1. Task Overview
The user's core request and success criteria
Any clarifications or constraints they specified
2. Current State
What has been completed so far
Files created, modified, or analyzed (with paths if relevant)
Key outputs or artifacts produced
3. Important Discoveries
Technical constraints or requirements uncovered
Decisions made and their rationale
Errors encountered and how they were resolved
What approaches were tried that didn't work (and why)
4. Next Steps
Specific actions needed to complete the task
Any blockers or open questions to resolve
Priority order if multiple steps remain
5. Context to Preserve
User preferences or style requirements
Domain-specific details that aren't obvious
Any promises made to the user
Be concise but complete\u2014err on the side of including information that would prevent duplicate work or repeated mistakes. Write in a way that enables immediate resumption of the task.
Wrap your summary in <summary></summary> tags.`;
    Ei = (() => {
      class r {
        constructor(e, t, n) {
          U.add(this), this.client = e, Tt.set(this, false), Ke.set(this, false), C.set(this, void 0), ee.set(this, void 0), G.set(this, void 0), Ve.set(this, void 0), xe.set(this, void 0), $e.set(this, void 0), Dr.set(this, 0), ie.set(this, { status: "idle" }), Je.set(this, null), Mt.set(this, /* @__PURE__ */ new Map()), Ye.set(this, []), xa(t), _(this, C, { params: { ...t, messages: JSON.parse(JSON.stringify(t.messages)) } }, "f");
          let i = Gs(t.tools, t.messages);
          _(this, ee, { ...n, headers: l([yr("BetaToolRunner"), i.length ? { [Ue]: i.join(", ") } : void 0, n?.headers]) }, "f"), _(this, $e, wi(), "f"), t.compactionControl?.enabled && console.warn('Anthropic: The `compactionControl` parameter is deprecated and will be removed in a future version. Use server-side compaction instead by passing `edits: [{ type: "compact_20260112" }]` in the params passed to `toolRunner()`. See https://platform.claude.com/docs/en/build-with-claude/compaction');
        }
        async *[(Tt = /* @__PURE__ */ new WeakMap(), Ke = /* @__PURE__ */ new WeakMap(), C = /* @__PURE__ */ new WeakMap(), ee = /* @__PURE__ */ new WeakMap(), G = /* @__PURE__ */ new WeakMap(), Ve = /* @__PURE__ */ new WeakMap(), xe = /* @__PURE__ */ new WeakMap(), $e = /* @__PURE__ */ new WeakMap(), Dr = /* @__PURE__ */ new WeakMap(), ie = /* @__PURE__ */ new WeakMap(), Je = /* @__PURE__ */ new WeakMap(), Mt = /* @__PURE__ */ new WeakMap(), Ye = /* @__PURE__ */ new WeakMap(), U = /* @__PURE__ */ new WeakSet(), ka = async function() {
          let t = a(this, C, "f").params.compactionControl;
          if (!t || !t.enabled) return false;
          let n = 0;
          if (a(this, G, "f") !== void 0) try {
            let p = await a(this, G, "f");
            n = p.usage.input_tokens + (p.usage.cache_creation_input_tokens ?? 0) + (p.usage.cache_read_input_tokens ?? 0) + p.usage.output_tokens;
          } catch {
            return false;
          }
          let i = t.contextTokenThreshold ?? 1e5;
          if (n < i) return false;
          let o = t.model ?? a(this, C, "f").params.model, c = t.summaryPrompt ?? ya, d = a(this, C, "f").params.messages;
          if (d[d.length - 1].role === "assistant") {
            let p = d[d.length - 1];
            if (Array.isArray(p.content)) {
              let f = p.content.filter((m) => m.type !== "tool_use");
              f.length === 0 ? d.pop() : p.content = f;
            }
          }
          let u = await this.client.beta.messages.create({ model: o, messages: [...d, { role: "user", content: [{ type: "text", text: c }] }], max_tokens: a(this, C, "f").params.max_tokens }, { signal: a(this, ee, "f").signal, headers: l([a(this, ee, "f").headers, yr("compaction")]) });
          if (u.content[0]?.type !== "text") throw new y("Expected text response for compaction");
          return a(this, U, "m", Si).call(this), _(this, Je, null, "f"), a(this, C, "f").params.messages = [{ role: "user", content: u.content }], true;
        }, Symbol.asyncIterator)]() {
          var e;
          if (a(this, Tt, "f")) throw new y("Cannot iterate over a consumed stream");
          _(this, Tt, true, "f"), _(this, Ke, true, "f"), _(this, xe, void 0, "f");
          try {
            for (; ; ) try {
              if (a(this, C, "f").params.max_iterations && a(this, Dr, "f") >= a(this, C, "f").params.max_iterations) break;
              if (a(this, U, "m", Sa).call(this), a(this, ie, "f").status === "scheduled" && Aa(a(this, Je, "f")) !== "resume") {
                yield* a(this, U, "m", yi).call(this, a(this, ie, "f").config);
                continue;
              }
              _(this, Ke, false, "f"), _(this, xe, void 0, "f"), _(this, Dr, (e = a(this, Dr, "f"), e++, e), "f"), _(this, G, void 0, "f");
              let { max_iterations: t, compactionControl: n, ...i } = a(this, C, "f").params;
              if (yield* a(this, U, "m", bi).call(this, i), !await a(this, U, "m", ka).call(this)) {
                if (a(this, Ke, "f")) _(this, Je, null, "f");
                else {
                  let d = await a(this, G, "f"), u = Aa(d.stop_reason);
                  _(this, Je, d.stop_reason, "f"), a(this, C, "f").params.messages.push({ role: d.role, content: d.content });
                  let { container: p } = a(this, C, "f").params;
                  if (d.container && (p == null ? a(this, C, "f").params.container = d.container.id : typeof p == "object" && p.id == null && (a(this, C, "f").params.container = { ...p, id: d.container.id })), u === "stop") {
                    yield* a(this, U, "m", xi).call(this);
                    break;
                  }
                  if (u === "resume") continue;
                }
                let c = await a(this, U, "m", vi).call(this, a(this, C, "f").params.messages.at(-1));
                if (c) a(this, C, "f").params.messages.push(c);
                else if (!a(this, Ke, "f")) {
                  yield* a(this, U, "m", xi).call(this);
                  break;
                }
              }
            } finally {
              a(this, Ve, "f")?.abort(), _(this, Ve, void 0, "f");
            }
            if (!a(this, G, "f")) throw new y("ToolRunner concluded without a message from the server");
            a(this, $e, "f").resolve(await a(this, G, "f"));
          } catch (t) {
            throw _(this, Tt, false, "f"), a(this, $e, "f").promise.catch(() => {
            }), a(this, $e, "f").reject(t), _(this, $e, wi(), "f"), t;
          }
        }
        setMessagesParams(e) {
          let t = typeof e == "function" ? e(a(this, C, "f").params) : e;
          if (xa(t), a(this, ie, "f").status !== "idle" && Ri(t), a(this, ie, "f").status === "in_flight" && t.messages !== a(this, C, "f").params.messages) throw new y("Message params can't be changed while the conversation is being compacted, because the compaction response is about to replace them. Change them after this iteration instead.");
          a(this, C, "f").params = t, _(this, Ke, true, "f"), _(this, xe, void 0, "f");
        }
        setRequestOptions(e) {
          typeof e == "function" ? _(this, ee, e(a(this, ee, "f")), "f") : _(this, ee, { ...a(this, ee, "f"), ...e }, "f");
        }
        async generateToolResponse(e = a(this, ee, "f").signal) {
          let t = await a(this, G, "f") ?? this.params.messages.at(-1);
          return t ? a(this, U, "m", vi).call(this, t, e) : null;
        }
        done() {
          return a(this, $e, "f").promise;
        }
        async runUntilDone() {
          if (!a(this, Tt, "f")) for await (let e of this) ;
          return this.done();
        }
        get params() {
          return a(this, C, "f").params;
        }
        pushMessages(...e) {
          this.setMessagesParams((t) => ({ ...t, messages: [...t.messages, ...e] }));
        }
        compactBeforeNextTurn(e) {
          a(this, ie, "f").status !== "in_flight" && (Ri(a(this, C, "f").params), _(this, ie, { status: "scheduled", config: e ?? { type: "summarize" } }, "f"));
        }
        addTools(...e) {
          for (let t of e) "name" in t && a(this, Mt, "f").set(t.name, "run" in t ? t : null), a(this, Ye, "f").push({ type: "addition", tool: t });
        }
        removeTools(...e) {
          for (let t of e) {
            let n = typeof t == "string" ? t : t.name;
            a(this, Mt, "f").set(n, null), a(this, Ye, "f").push({ type: "removal", name: n });
          }
        }
        then(e, t) {
          return this.runUntilDone().then(e, t);
        }
      }
      return bi = async function* (e) {
        e.stream ? (_(this, Ve, this.client.beta.messages.stream({ ...e }, a(this, ee, "f")), "f"), _(this, G, a(this, Ve, "f").finalMessage(), "f"), a(this, G, "f").catch(() => {
        }), yield a(this, Ve, "f")) : (_(this, G, this.client.beta.messages.create({ ...e, stream: false }, a(this, ee, "f")), "f"), yield a(this, G, "f"));
      }, yi = async function* (e) {
        Ri(a(this, C, "f").params);
        let { max_iterations: t, compactionControl: n, ...i } = a(this, C, "f").params, o = Kl(i);
        _(this, ie, { status: "in_flight" }, "f"), _(this, xe, void 0, "f");
        let c = a(this, G, "f");
        try {
          yield* a(this, U, "m", bi).call(this, { ...o, compaction: e });
          let d = await a(this, G, "f");
          d.content.some((u) => u.type === "compaction" && u.content) ? (a(this, U, "m", Si).call(this), a(this, C, "f").params.messages = [{ role: d.role, content: d.content }]) : (T(this.client).warn("Compaction produced no summary; keeping the conversation as it is."), _(this, G, c, "f"));
        } finally {
          _(this, ie, { status: "idle" }, "f");
        }
      }, rs = function() {
        let e = /* @__PURE__ */ new Map();
        for (let t of a(this, C, "f").params.tools) "run" in t && e.set(t.name, t);
        for (let [t, n] of a(this, Mt, "f")) n ? e.set(t, n) : e.delete(t);
        return e;
      }, ki = function() {
        let e = new Set(a(this, U, "m", rs).call(this).keys());
        for (let t of [...a(this, C, "f").params.messages, a(this, U, "m", Ai).call(this)]) if (typeof t.content != "string") {
          for (let n of t.content) if (t.role === "system") va(n, e);
          else if (t.role === "assistant" && n.type === "compaction") for (let i of n.tool_changes ?? []) va(i, e);
        }
        return e;
      }, Si = function() {
        let e = a(this, U, "m", ki).call(this);
        for (let t of a(this, U, "m", rs).call(this).keys()) e.has(t) || a(this, Mt, "f").set(t, null);
      }, xi = async function* () {
        if (a(this, ie, "f").status !== "scheduled") return;
        let e = a(this, C, "f").params.messages.at(-1)?.content;
        if (Array.isArray(e) && e.some((t) => t.type === "tool_use")) {
          T(this.client).warn("The pending compaction was skipped because the last turn ended with tool calls that were not run. Call `compactBeforeNextTurn()` again if you continue the conversation."), _(this, ie, { status: "idle" }, "f");
          return;
        }
        yield* a(this, U, "m", yi).call(this, a(this, ie, "f").config);
      }, vi = async function(e, t = a(this, ee, "f").signal) {
        return a(this, xe, "f") !== void 0 ? a(this, xe, "f") : (_(this, xe, Vl(a(this, U, "m", rs).call(this), a(this, U, "m", ki).call(this), e, { ...a(this, ee, "f"), signal: t }), "f"), a(this, xe, "f"));
      }, Sa = function() {
        a(this, Je, "f") === "pause_turn" || a(this, Ye, "f").length === 0 || (a(this, C, "f").params.messages.push(a(this, U, "m", Ai).call(this)), _(this, Ye, [], "f"));
      }, Ai = function() {
        let e = [];
        for (let t of a(this, Ye, "f")) {
          if (t.type === "removal") {
            e.push({ type: "tool_removal", tool: { type: "tool_reference", name: t.name } });
            continue;
          }
          let n = t.tool;
          if ("run" in t.tool) {
            let { run: i, parse: o, close: c, ...d } = t.tool;
            n = d;
          }
          e.push({ type: "tool_addition", tool: { type: "tool_definition", definition: n } });
        }
        return { role: "system", content: e };
      }, r;
    })();
    Ra = {};
    Xl = ["claude-mythos-preview", "claude-opus-4-6"];
    ns = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.batches = new Et(this._client);
        }
        create(e, t) {
          let n = Ea(e), { betas: i, user_profile_id: o, workspace_id: c, ...d } = n;
          d.model in Ra && console.warn(`The model '${d.model}' is deprecated and will reach end-of-life on ${Ra[d.model]}
Please migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`), Xl.includes(d.model) && d.thinking && d.thinking.type === "enabled" && console.warn(`Using Claude with ${d.model} and 'thinking.type=enabled' is deprecated. Use 'thinking.type=adaptive' instead which results in better model performance in our testing: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking`);
          let u = t?.timeout ?? this._client._options.timeout;
          if (!d.stream && u == null) {
            let f = Vn[d.model] ?? void 0;
            u = this._client.calculateNonstreamingTimeout(d.max_tokens, f);
          }
          let p = yn(d.tools, d.messages);
          return this._client.post("/v1/messages?beta=true", { body: d, timeout: u ?? 6e5, ...t, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0, ...o != null ? { "anthropic-user-profile-id": o } : void 0, ...c != null ? { "anthropic-workspace-id": c } : void 0 }, p, t?.headers]), stream: n.stream ?? false });
        }
        parse(e, t) {
          return t = { ...t, headers: l([{ "anthropic-beta": [...e.betas ?? [], "structured-outputs-2025-12-15"].toString() }, t?.headers]) }, this.create(e, t).then((n) => di(n, e, { logger: this._client.logger ?? console }));
        }
        stream(e, t) {
          return ba.createMessage(this, e, t);
        }
        countTokens(e, t) {
          let n = Ea(e), { betas: i, user_profile_id: o, workspace_id: c, ...d } = n;
          return this._client.post("/v1/messages/count_tokens?beta=true", { body: d, ...t, headers: l([{ "anthropic-beta": [...i ?? [], "token-counting-2024-11-01"].toString(), ...o != null ? { "anthropic-user-profile-id": o } : void 0, ...c != null ? { "anthropic-workspace-id": c } : void 0 }, t?.headers]) });
        }
        toolRunner(e, t) {
          return new Ei(this._client, e, t);
        }
      }
      return r.Batches = Et, r.BetaToolRunner = Ei, r.ToolError = bt, r;
    })();
    Ot = class extends w {
      retrieve(s, e) {
        return this._client.get(h`/v1/organizations/api_keys/${s}?beta=true`, e);
      }
      update(s, e, t) {
        return this._client.post(h`/v1/organizations/api_keys/${s}?beta=true`, { body: e, ...t });
      }
      list(s = {}, e) {
        return this._client.getAPIList("/v1/organizations/api_keys?beta=true", q, { query: s, ...e });
      }
    };
    Ct = class extends w {
      retrieve(s) {
        return this._client.get("/v1/organizations/compliance_settings?beta=true", s);
      }
      update(s, e) {
        return this._client.post("/v1/organizations/compliance_settings?beta=true", { body: s, ...e });
      }
    };
    $t = class extends w {
      create(s, e) {
        return this._client.post("/v1/organizations/external_keys?beta=true", { body: s, ...e });
      }
      retrieve(s, e) {
        return this._client.get(h`/v1/organizations/external_keys/${s}?beta=true`, e);
      }
      update(s, e, t) {
        return this._client.post(h`/v1/organizations/external_keys/${s}?beta=true`, { body: e, ...t });
      }
      list(s = {}, e) {
        return this._client.getAPIList("/v1/organizations/external_keys?beta=true", S, { query: s, ...e });
      }
      delete(s, e) {
        return this._client.delete(h`/v1/organizations/external_keys/${s}?beta=true`, e);
      }
      validate(s, e) {
        return this._client.post(h`/v1/organizations/external_keys/${s}/validate?beta=true`, e);
      }
    };
    Nt = class extends w {
      create(s, e) {
        return this._client.post("/v1/organizations/invites?beta=true", { body: s, ...e });
      }
      retrieve(s, e) {
        return this._client.get(h`/v1/organizations/invites/${s}?beta=true`, e);
      }
      list(s = {}, e) {
        return this._client.getAPIList("/v1/organizations/invites?beta=true", q, { query: s, ...e });
      }
      delete(s, e) {
        return this._client.delete(h`/v1/organizations/invites/${s}?beta=true`, e);
      }
    };
    Lt = class extends w {
      list(s = {}, e) {
        return this._client.getAPIList("/v1/organizations/rate_limits?beta=true", S, { query: s, ...e });
      }
    };
    Ft = class extends w {
      retrieve(s, e) {
        return this._client.get(h`/v1/organizations/users/${s}?beta=true`, e);
      }
      update(s, e, t) {
        return this._client.post(h`/v1/organizations/users/${s}?beta=true`, { body: e, ...t });
      }
      list(s = {}, e) {
        return this._client.getAPIList("/v1/organizations/users?beta=true", q, { query: s, ...e });
      }
      remove(s, e) {
        return this._client.delete(h`/v1/organizations/users/${s}?beta=true`, e);
      }
    };
    Ht = class extends w {
      create(s, e) {
        let { betas: t, ...n } = s;
        return this._client.post("/v1/organizations/federation_issuers?beta=true", { body: n, ...e, headers: l([{ ...t?.toString() != null ? { "anthropic-beta": t?.toString() } : void 0 }, e?.headers]) });
      }
      retrieve(s, e = {}, t) {
        let { betas: n } = e ?? {};
        return this._client.get(h`/v1/organizations/federation_issuers/${s}?beta=true`, { ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
      update(s, e, t) {
        let { betas: n, ...i } = e;
        return this._client.post(h`/v1/organizations/federation_issuers/${s}?beta=true`, { body: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { betas: t, ...n } = s ?? {};
        return this._client.getAPIList("/v1/organizations/federation_issuers?beta=true", S, { query: n, ...e, headers: l([{ ...t?.toString() != null ? { "anthropic-beta": t?.toString() } : void 0 }, e?.headers]) });
      }
      archive(s, e = {}, t) {
        let { betas: n } = e ?? {};
        return this._client.post(h`/v1/organizations/federation_issuers/${s}/archive?beta=true`, { ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
    };
    Dt = class extends w {
      list(s, e = {}, t) {
        let { betas: n, ...i } = e ?? {};
        return this._client.getAPIList(h`/v1/organizations/federation_rules/${s}/workspaces?beta=true`, S, { query: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
      add(s, e, t) {
        let { betas: n, ...i } = e;
        return this._client.post(h`/v1/organizations/federation_rules/${s}/workspaces?beta=true`, { body: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
      remove(s, e, t) {
        let { federation_rule_id: n, betas: i } = e;
        return this._client.delete(h`/v1/organizations/federation_rules/${n}/workspaces/${s}?beta=true`, { ...t, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, t?.headers]) });
      }
    };
    ss = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.workspaces = new Dt(this._client);
        }
        create(e, t) {
          let { betas: n, ...i } = e;
          return this._client.post("/v1/organizations/federation_rules?beta=true", { body: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
        }
        retrieve(e, t = {}, n) {
          let { betas: i } = t ?? {};
          return this._client.get(h`/v1/organizations/federation_rules/${e}?beta=true`, { ...n, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, n?.headers]) });
        }
        update(e, t, n) {
          let { betas: i, ...o } = t;
          return this._client.post(h`/v1/organizations/federation_rules/${e}?beta=true`, { body: o, ...n, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, ...i } = e ?? {};
          return this._client.getAPIList("/v1/organizations/federation_rules?beta=true", S, { query: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
        }
        archive(e, t = {}, n) {
          let { betas: i } = t ?? {};
          return this._client.post(h`/v1/organizations/federation_rules/${e}/archive?beta=true`, { ...n, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, n?.headers]) });
        }
      }
      return r.Workspaces = Dt, r;
    })();
    is = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.issuers = new Ht(this._client), this.rules = new ss(this._client);
        }
      }
      return r.Issuers = Ht, r.Rules = ss, r;
    })();
    Bt = class extends w {
      list(s, e = {}, t) {
        let { betas: n, ...i } = e ?? {};
        return this._client.getAPIList(h`/v1/organizations/service_accounts/${s}/workspaces?beta=true`, S, { query: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
      add(s, e, t) {
        let { betas: n, ...i } = e;
        return this._client.post(h`/v1/organizations/service_accounts/${s}/workspaces?beta=true`, { body: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
      remove(s, e, t) {
        let { service_account_id: n, betas: i } = e;
        return this._client.delete(h`/v1/organizations/service_accounts/${n}/workspaces/${s}?beta=true`, { ...t, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, t?.headers]) });
      }
    };
    os = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.workspaces = new Bt(this._client);
        }
        create(e, t) {
          let { betas: n, ...i } = e;
          return this._client.post("/v1/organizations/service_accounts?beta=true", { body: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
        }
        retrieve(e, t = {}, n) {
          let { betas: i } = t ?? {};
          return this._client.get(h`/v1/organizations/service_accounts/${e}?beta=true`, { ...n, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, n?.headers]) });
        }
        update(e, t, n) {
          let { betas: i, ...o } = t;
          return this._client.post(h`/v1/organizations/service_accounts/${e}?beta=true`, { body: o, ...n, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, ...i } = e ?? {};
          return this._client.getAPIList("/v1/organizations/service_accounts?beta=true", S, { query: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
        }
        archive(e, t = {}, n) {
          let { betas: i } = t ?? {};
          return this._client.post(h`/v1/organizations/service_accounts/${e}/archive?beta=true`, { ...n, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, n?.headers]) });
        }
      }
      return r.Workspaces = Bt, r;
    })();
    Wt = class extends w {
      retrieve(s, e, t) {
        let { workspace_id: n } = e;
        return this._client.get(h`/v1/organizations/workspaces/${n}/members/${s}?beta=true`, t);
      }
      update(s, e, t) {
        let { workspace_id: n, ...i } = e;
        return this._client.post(h`/v1/organizations/workspaces/${n}/members/${s}?beta=true`, { body: i, ...t });
      }
      list(s, e = {}, t) {
        return this._client.getAPIList(h`/v1/organizations/workspaces/${s}/members?beta=true`, q, { query: e, ...t });
      }
      add(s, e, t) {
        return this._client.post(h`/v1/organizations/workspaces/${s}/members?beta=true`, { body: e, ...t });
      }
      remove(s, e, t) {
        let { workspace_id: n } = e;
        return this._client.delete(h`/v1/organizations/workspaces/${n}/members/${s}?beta=true`, t);
      }
    };
    Ut = class extends w {
      list(s, e = {}, t) {
        return this._client.getAPIList(h`/v1/organizations/workspaces/${s}/rate_limits?beta=true`, S, { query: e, ...t });
      }
    };
    qt = class extends w {
      retrieve(s, e, t) {
        let { workspace_id: n, betas: i } = e;
        return this._client.get(h`/v1/organizations/workspaces/${n}/service_accounts/${s}?beta=true`, { ...t, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, t?.headers]) });
      }
      update(s, e, t) {
        let { workspace_id: n, betas: i, ...o } = e;
        return this._client.post(h`/v1/organizations/workspaces/${n}/service_accounts/${s}?beta=true`, { body: o, ...t, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, t?.headers]) });
      }
      list(s, e = {}, t) {
        let { betas: n, ...i } = e ?? {};
        return this._client.getAPIList(h`/v1/organizations/workspaces/${s}/service_accounts?beta=true`, S, { query: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
      add(s, e, t) {
        let { betas: n, ...i } = e;
        return this._client.post(h`/v1/organizations/workspaces/${s}/service_accounts?beta=true`, { body: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
      }
      remove(s, e, t) {
        let { workspace_id: n, betas: i } = e;
        return this._client.delete(h`/v1/organizations/workspaces/${n}/service_accounts/${s}?beta=true`, { ...t, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0 }, t?.headers]) });
      }
    };
    as = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.rateLimits = new Ut(this._client), this.members = new Wt(this._client), this.serviceAccounts = new qt(this._client);
        }
        create(e, t) {
          let { betas: n, ...i } = e;
          return this._client.post("/v1/organizations/workspaces?beta=true", { body: i, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0 }, t?.headers]) });
        }
        retrieve(e, t) {
          return this._client.get(h`/v1/organizations/workspaces/${e}?beta=true`, t);
        }
        update(e, t, n) {
          return this._client.post(h`/v1/organizations/workspaces/${e}?beta=true`, { body: t, ...n });
        }
        list(e = {}, t) {
          return this._client.getAPIList("/v1/organizations/workspaces?beta=true", q, { query: e, ...t });
        }
        archive(e, t) {
          return this._client.post(h`/v1/organizations/workspaces/${e}/archive?beta=true`, t);
        }
      }
      return r.RateLimits = Ut, r.Members = Wt, r.ServiceAccounts = qt, r;
    })();
    cs = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.apiKeys = new Ot(this._client), this.externalKeys = new $t(this._client), this.federation = new is(this._client), this.invites = new Nt(this._client), this.serviceAccounts = new os(this._client), this.users = new Ft(this._client), this.workspaces = new as(this._client), this.rateLimits = new Lt(this._client), this.complianceSettings = new Ct(this._client);
        }
        retrieve(e) {
          return this._client.get("/v1/organizations/me?beta=true", e);
        }
      }
      return r.APIKeys = Ot, r.ExternalKeys = $t, r.Federation = is, r.Invites = Nt, r.ServiceAccounts = os, r.Users = Ft, r.Workspaces = as, r.RateLimits = Lt, r.ComplianceSettings = Ct, r;
    })();
    ls = (() => {
      class r extends w {
        list(e, t = {}, n) {
          let { betas: i, workspace_id: o, ...c } = t ?? {};
          return this._client.getAPIList(h`/v1/sessions/${e}/events?beta=true`, S, { query: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        send(e, t, n) {
          let { betas: i, workspace_id: o, ...c } = t;
          return this._client.post(h`/v1/sessions/${e}/events?beta=true`, { body: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        stream(e, t = {}, n) {
          let { betas: i, workspace_id: o, ...c } = t ?? {};
          return this._client.get(h`/v1/sessions/${e}/events/stream?beta=true`, { query: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]), stream: true });
        }
        toolRunner(e, t) {
          return new Ir(e, { ...t, client: this._client });
        }
      }
      return r.SessionToolRunner = Ir, r;
    })();
    jt = class extends w {
      retrieve(s, e, t) {
        let { session_id: n, betas: i, workspace_id: o } = e;
        return this._client.get(h`/v1/sessions/${n}/resources/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      update(s, e, t) {
        let { session_id: n, betas: i, workspace_id: o, ...c } = e;
        return this._client.post(h`/v1/sessions/${n}/resources/${s}?beta=true`, { body: c, ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      list(s, e = {}, t) {
        let { betas: n, workspace_id: i, ...o } = e ?? {};
        return this._client.getAPIList(h`/v1/sessions/${s}/resources?beta=true`, S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      delete(s, e, t) {
        let { session_id: n, betas: i, workspace_id: o } = e;
        return this._client.delete(h`/v1/sessions/${n}/resources/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      add(s, e, t) {
        let { betas: n, workspace_id: i, ...o } = e;
        return this._client.post(h`/v1/sessions/${s}/resources?beta=true`, { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
    };
    zt = class extends w {
      list(s, e, t) {
        let { session_id: n, betas: i, workspace_id: o, ...c } = e;
        return this._client.getAPIList(h`/v1/sessions/${n}/threads/${s}/events?beta=true`, S, { query: c, ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      stream(s, e, t) {
        let { session_id: n, betas: i, workspace_id: o, ...c } = e;
        return this._client.get(h`/v1/sessions/${n}/threads/${s}/stream?beta=true`, { query: c, ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]), stream: true });
      }
    };
    us = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.events = new zt(this._client);
        }
        retrieve(e, t, n) {
          let { session_id: i, betas: o, workspace_id: c } = t;
          return this._client.get(h`/v1/sessions/${i}/threads/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...o ?? [], "managed-agents-2026-04-01"].toString(), ...c != null ? { "anthropic-workspace-id": c } : void 0 }, n?.headers]) });
        }
        list(e, t = {}, n) {
          let { betas: i, workspace_id: o, ...c } = t ?? {};
          return this._client.getAPIList(h`/v1/sessions/${e}/threads?beta=true`, S, { query: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        archive(e, t, n) {
          let { session_id: i, betas: o, workspace_id: c } = t;
          return this._client.post(h`/v1/sessions/${i}/threads/${e}/archive?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...o ?? [], "managed-agents-2026-04-01"].toString(), ...c != null ? { "anthropic-workspace-id": c } : void 0 }, n?.headers]) });
        }
      }
      return r.Events = zt, r;
    })();
    ds = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.events = new ls(this._client), this.resources = new jt(this._client), this.threads = new us(this._client);
        }
        create(e, t) {
          let { betas: n, workspace_id: i, ...o } = e;
          return this._client.post("/v1/sessions?beta=true", { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        retrieve(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.get(h`/v1/sessions/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        update(e, t, n) {
          let { betas: i, workspace_id: o, ...c } = t;
          return this._client.post(h`/v1/sessions/${e}?beta=true`, { body: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, workspace_id: i, ...o } = e ?? {};
          return this._client.getAPIList("/v1/sessions?beta=true", gn, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        delete(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.delete(h`/v1/sessions/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        archive(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.post(h`/v1/sessions/${e}/archive?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
      }
      return r.Events = ls, r.Resources = jt, r.Threads = us, r;
    })();
    Kt = class extends w {
      create(s, e, t) {
        let { betas: n, workspace_id: i, ...o } = e;
        return this._client.post(h`/v1/skills/${s}/versions?beta=true`, ce({ body: o, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) }, this._client, false));
      }
      retrieve(s, e, t) {
        let { skill_id: n, betas: i, workspace_id: o } = e;
        return this._client.get(h`/v1/skills/${n}/versions/${s}?beta=true`, { ...t, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0, ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      list(s, e = {}, t) {
        let { betas: n, workspace_id: i, ...o } = e ?? {};
        return this._client.getAPIList(h`/v1/skills/${s}/versions?beta=true`, S, { query: o, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      delete(s, e, t) {
        let { skill_id: n, betas: i, workspace_id: o } = e;
        return this._client.delete(h`/v1/skills/${n}/versions/${s}?beta=true`, { ...t, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0, ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      download(s, e, t) {
        let { skill_id: n, betas: i, workspace_id: o } = e;
        return this._client.get(h`/v1/skills/${n}/versions/${s}/content?beta=true`, { ...t, headers: l([{ Accept: "application/binary", ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0, ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]), __binaryResponse: true });
      }
    };
    hs = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.versions = new Kt(this._client);
        }
        create(e, t) {
          let { betas: n, workspace_id: i, ...o } = e;
          return this._client.post("/v1/skills?beta=true", ce({ body: o, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) }, this._client, false));
        }
        retrieve(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.get(h`/v1/skills/${e}?beta=true`, { ...n, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0, ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, workspace_id: i, ...o } = e ?? {};
          return this._client.getAPIList("/v1/skills?beta=true", S, { query: o, ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        delete(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.delete(h`/v1/skills/${e}?beta=true`, { ...n, headers: l([{ ...i?.toString() != null ? { "anthropic-beta": i?.toString() } : void 0, ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
      }
      return r.Versions = Kt, r;
    })();
    Vt = class extends w {
      create(s, e, t) {
        let { betas: n, workspace_id: i, ...o } = e;
        return this._client.post(h`/v1/tunnels/${s}/certificates?beta=true`, { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "mcp-tunnels-2026-06-22"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      retrieve(s, e, t) {
        let { tunnel_id: n, betas: i, workspace_id: o } = e;
        return this._client.get(h`/v1/tunnels/${n}/certificates/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "mcp-tunnels-2026-06-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      list(s, e = {}, t) {
        let { betas: n, workspace_id: i, ...o } = e ?? {};
        return this._client.getAPIList(h`/v1/tunnels/${s}/certificates?beta=true`, S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "mcp-tunnels-2026-06-22"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      archive(s, e, t) {
        let { tunnel_id: n, betas: i, workspace_id: o } = e;
        return this._client.post(h`/v1/tunnels/${n}/certificates/${s}/archive?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "mcp-tunnels-2026-06-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
    };
    fs = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.certificates = new Vt(this._client);
        }
        create(e, t) {
          let { betas: n, workspace_id: i, ...o } = e;
          return this._client.post("/v1/tunnels?beta=true", { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "mcp-tunnels-2026-06-22"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        retrieve(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.get(h`/v1/tunnels/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "mcp-tunnels-2026-06-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, workspace_id: i, ...o } = e ?? {};
          return this._client.getAPIList("/v1/tunnels?beta=true", S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "mcp-tunnels-2026-06-22"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        archive(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.post(h`/v1/tunnels/${e}/archive?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "mcp-tunnels-2026-06-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        revealToken(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.post(h`/v1/tunnels/${e}/reveal_token?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "mcp-tunnels-2026-06-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        rotateToken(e, t, n) {
          let { betas: i, workspace_id: o, ...c } = t;
          return this._client.post(h`/v1/tunnels/${e}/rotate_token?beta=true`, { body: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "mcp-tunnels-2026-06-22"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
      }
      return r.Certificates = Vt, r;
    })();
    Jt = class extends w {
      create(s, e, t) {
        let { betas: n, workspace_id: i, ...o } = e;
        return this._client.post(h`/v1/vaults/${s}/credentials?beta=true`, { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      retrieve(s, e, t) {
        let { vault_id: n, betas: i, workspace_id: o } = e;
        return this._client.get(h`/v1/vaults/${n}/credentials/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      update(s, e, t) {
        let { vault_id: n, betas: i, workspace_id: o, ...c } = e;
        return this._client.post(h`/v1/vaults/${n}/credentials/${s}?beta=true`, { body: c, ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      list(s, e = {}, t) {
        let { betas: n, workspace_id: i, ...o } = e ?? {};
        return this._client.getAPIList(h`/v1/vaults/${s}/credentials?beta=true`, S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      delete(s, e, t) {
        let { vault_id: n, betas: i, workspace_id: o } = e;
        return this._client.delete(h`/v1/vaults/${n}/credentials/${s}?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      archive(s, e, t) {
        let { vault_id: n, betas: i, workspace_id: o } = e;
        return this._client.post(h`/v1/vaults/${n}/credentials/${s}/archive?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
      mcpOAuthValidate(s, e, t) {
        let { vault_id: n, betas: i, workspace_id: o } = e;
        return this._client.post(h`/v1/vaults/${n}/credentials/${s}/mcp_oauth_validate?beta=true`, { ...t, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, t?.headers]) });
      }
    };
    ps = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.credentials = new Jt(this._client);
        }
        create(e, t) {
          let { betas: n, workspace_id: i, ...o } = e;
          return this._client.post("/v1/vaults?beta=true", { body: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        retrieve(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.get(h`/v1/vaults/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        update(e, t, n) {
          let { betas: i, workspace_id: o, ...c } = t;
          return this._client.post(h`/v1/vaults/${e}?beta=true`, { body: c, ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { betas: n, workspace_id: i, ...o } = e ?? {};
          return this._client.getAPIList("/v1/vaults?beta=true", S, { query: o, ...t, headers: l([{ "anthropic-beta": [...n ?? [], "managed-agents-2026-04-01"].toString(), ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
        delete(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.delete(h`/v1/vaults/${e}?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
        archive(e, t = {}, n) {
          let { betas: i, workspace_id: o } = t ?? {};
          return this._client.post(h`/v1/vaults/${e}/archive?beta=true`, { ...n, headers: l([{ "anthropic-beta": [...i ?? [], "managed-agents-2026-04-01"].toString(), ...o != null ? { "anthropic-workspace-id": o } : void 0 }, n?.headers]) });
        }
      }
      return r.Credentials = Jt, r;
    })();
    Br = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.models = new ct(this._client), this.messages = new ns(this._client), this.agents = new vn(this._client), this.environments = new jn(this._client), this.sessions = new ds(this._client), this.deployments = new st(this._client), this.deploymentRuns = new nt(this._client), this.vaults = new ps(this._client), this.memoryStores = new zn(this._client), this.files = new at(this._client), this.skills = new hs(this._client), this.webhooks = new dt(this._client), this.userProfiles = new lt(this._client), this.dreams = new it(this._client), this.tunnels = new fs(this._client), this.organization = new cs(this._client);
        }
      }
      return r.Models = ct, r.Messages = ns, r.Agents = vn, r.Environments = jn, r.Sessions = ds, r.Deployments = st, r.DeploymentRuns = nt, r.Vaults = ps, r.MemoryStores = zn, r.Files = at, r.Skills = hs, r.Webhooks = dt, r.UserProfiles = lt, r.Dreams = it, r.Tunnels = fs, r.Organization = cs, r;
    })();
    Ge = class extends w {
      create(s, e) {
        let { betas: t, workspace_id: n, ...i } = s;
        return this._client.post("/v1/complete", { body: i, timeout: this._client._options.timeout ?? 6e5, ...e, headers: l([{ ...t?.toString() != null ? { "anthropic-beta": t?.toString() } : void 0, ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]), stream: s.stream ?? false });
      }
    };
    Xe = class extends w {
      list(s = {}, e) {
        let { workspace_id: t, ...n } = s ?? {};
        return this._client.getAPIList("/v1/files", S, { query: n, ...e, headers: l([{ ...t != null ? { "anthropic-workspace-id": t } : void 0 }, e?.headers]) });
      }
      delete(s, e = {}, t) {
        let { workspace_id: n } = e ?? {};
        return this._client.delete(h`/v1/files/${s}`, { ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) });
      }
      download(s, e = {}, t) {
        let { workspace_id: n } = e ?? {};
        return this._client.get(h`/v1/files/${s}/content`, { ...t, headers: l([{ Accept: "application/binary", ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]), __binaryResponse: true });
      }
      retrieveMetadata(s, e = {}, t) {
        let { workspace_id: n } = e ?? {};
        return this._client.get(h`/v1/files/${s}`, { ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) });
      }
      upload(s, e) {
        let { workspace_id: t, ...n } = s;
        return this._client.post("/v1/files", ce({ body: n, ...e, headers: l([{ ...t != null ? { "anthropic-workspace-id": t } : void 0 }, kn(n.file), e?.headers]) }, this._client));
      }
    };
    He();
    L();
    Ma = (() => {
      class r {
        constructor(e, t) {
          de.add(this), this.messages = [], this.receivedMessages = [], Ne.set(this, void 0), Yt.set(this, null), this.controller = new AbortController(), Wr.set(this, void 0), ms.set(this, () => {
          }), Ur.set(this, () => {
          }), qr.set(this, void 0), _s.set(this, () => {
          }), jr.set(this, () => {
          }), ve.set(this, {}), zr.set(this, false), gs.set(this, false), ws.set(this, false), Qe.set(this, false), bs.set(this, void 0), ys.set(this, void 0), ks.set(this, void 0), Kr.set(this, void 0), Mi.set(this, (n) => {
            if (_(this, gs, true, "f"), he(n) && (n = new J()), n instanceof J) return _(this, ws, true, "f"), this._emit("abort", n);
            if (n instanceof y) return this._emit("error", n);
            if (n instanceof Error) {
              let i = new y(n.message);
              return i.cause = n, this._emit("error", i);
            }
            return this._emit("error", new y(String(n)));
          }), _(this, Wr, new Promise((n, i) => {
            _(this, ms, n, "f"), _(this, Ur, i, "f");
          }), "f"), _(this, qr, new Promise((n, i) => {
            _(this, _s, n, "f"), _(this, jr, i, "f");
          }), "f"), a(this, Wr, "f").catch(() => {
          }), a(this, qr, "f").catch(() => {
          }), _(this, Yt, e, "f"), _(this, Kr, t?.logger ?? console, "f");
        }
        get response() {
          return a(this, bs, "f");
        }
        get request_id() {
          return a(this, ys, "f");
        }
        get workspace_id() {
          return a(this, ks, "f");
        }
        async withResponse() {
          _(this, Qe, true, "f");
          let e = await a(this, Wr, "f");
          if (!e) throw new Error("Could not resolve a `Response` object");
          return { data: this, response: e, request_id: e.headers.get("request-id"), workspace_id: e.headers.get("anthropic-workspace-id") };
        }
        static fromReadableStream(e) {
          let t = new r(null);
          return t._run(() => t._fromReadableStream(e)), t;
        }
        static createMessage(e, t, n, { logger: i } = {}) {
          let o = new r(t, { logger: i });
          for (let c of t.messages) o._addMessageParam(c);
          return _(o, Yt, { ...t, stream: true }, "f"), o._run(() => o._createMessage(e, { ...t, stream: true }, { ...n, headers: { ...n?.headers, [bn]: "stream" } })), o;
        }
        _run(e) {
          e().then(() => {
            this._emitFinal(), this._emit("end");
          }, a(this, Mi, "f"));
        }
        _addMessageParam(e) {
          this.messages.push(e);
        }
        _addMessage(e, t = true) {
          this.receivedMessages.push(e), t && this._emit("message", e);
        }
        async _createMessage(e, t, n) {
          let i = n?.signal, o;
          i && (i.aborted && this.controller.abort(), o = this.controller.abort.bind(this.controller), i.addEventListener("abort", o));
          try {
            a(this, de, "m", Oi).call(this);
            let { response: c, data: d } = await e.create({ ...t, stream: true }, { ...n, signal: this.controller.signal }).withResponse();
            this._connected(c);
            for await (let u of d) a(this, de, "m", Ci).call(this, u);
            if (d.controller.signal?.aborted) throw new J();
            a(this, de, "m", $i).call(this);
          } finally {
            i && o && i.removeEventListener("abort", o);
          }
        }
        _connected(e) {
          this.ended || (_(this, bs, e, "f"), _(this, ys, e?.headers.get("request-id"), "f"), _(this, ks, e?.headers.get("anthropic-workspace-id"), "f"), a(this, ms, "f").call(this, e), this._emit("connect"));
        }
        get ended() {
          return a(this, zr, "f");
        }
        get errored() {
          return a(this, gs, "f");
        }
        get aborted() {
          return a(this, ws, "f");
        }
        abort() {
          this.controller.abort();
        }
        on(e, t) {
          return (a(this, ve, "f")[e] || (a(this, ve, "f")[e] = [])).push({ listener: t }), this;
        }
        off(e, t) {
          let n = a(this, ve, "f")[e];
          if (!n) return this;
          let i = n.findIndex((o) => o.listener === t);
          return i >= 0 && n.splice(i, 1), this;
        }
        once(e, t) {
          return (a(this, ve, "f")[e] || (a(this, ve, "f")[e] = [])).push({ listener: t, once: true }), this;
        }
        emitted(e) {
          return new Promise((t, n) => {
            _(this, Qe, true, "f"), e !== "error" && this.once("error", n), this.once(e, t);
          });
        }
        async done() {
          _(this, Qe, true, "f"), await a(this, qr, "f");
        }
        get currentMessage() {
          return a(this, Ne, "f");
        }
        async finalMessage() {
          return await this.done(), a(this, de, "m", Ti).call(this);
        }
        async finalText() {
          return await this.done(), a(this, de, "m", Ia).call(this);
        }
        _emit(e, ...t) {
          if (a(this, zr, "f")) return;
          e === "end" && (_(this, zr, true, "f"), a(this, _s, "f").call(this));
          let n = a(this, ve, "f")[e];
          if (n && (a(this, ve, "f")[e] = n.filter((i) => !i.once), n.forEach(({ listener: i }) => i(...t))), e === "abort") {
            let i = t[0];
            !a(this, Qe, "f") && !n?.length && Promise.reject(i), a(this, Ur, "f").call(this, i), a(this, jr, "f").call(this, i), this._emit("end");
            return;
          }
          if (e === "error") {
            let i = t[0];
            !a(this, Qe, "f") && !n?.length && Promise.reject(i), a(this, Ur, "f").call(this, i), a(this, jr, "f").call(this, i), this._emit("end");
          }
        }
        _emitFinal() {
          this.receivedMessages.at(-1) && this._emit("finalMessage", a(this, de, "m", Ti).call(this));
        }
        async _fromReadableStream(e, t) {
          let n = t?.signal, i;
          n && (n.aborted && this.controller.abort(), i = this.controller.abort.bind(this.controller), n.addEventListener("abort", i));
          try {
            a(this, de, "m", Oi).call(this), this._connected(null);
            let o = ke.fromReadableStream(e, this.controller);
            for await (let c of o) a(this, de, "m", Ci).call(this, c);
            if (o.controller.signal?.aborted) throw new J();
            a(this, de, "m", $i).call(this);
          } finally {
            n && i && n.removeEventListener("abort", i);
          }
        }
        [(Ne = /* @__PURE__ */ new WeakMap(), Yt = /* @__PURE__ */ new WeakMap(), Wr = /* @__PURE__ */ new WeakMap(), ms = /* @__PURE__ */ new WeakMap(), Ur = /* @__PURE__ */ new WeakMap(), qr = /* @__PURE__ */ new WeakMap(), _s = /* @__PURE__ */ new WeakMap(), jr = /* @__PURE__ */ new WeakMap(), ve = /* @__PURE__ */ new WeakMap(), zr = /* @__PURE__ */ new WeakMap(), gs = /* @__PURE__ */ new WeakMap(), ws = /* @__PURE__ */ new WeakMap(), Qe = /* @__PURE__ */ new WeakMap(), bs = /* @__PURE__ */ new WeakMap(), ys = /* @__PURE__ */ new WeakMap(), ks = /* @__PURE__ */ new WeakMap(), Kr = /* @__PURE__ */ new WeakMap(), Mi = /* @__PURE__ */ new WeakMap(), de = /* @__PURE__ */ new WeakSet(), Ti = function() {
          if (this.receivedMessages.length === 0) throw new y("stream ended without producing a Message with role=assistant");
          return this.receivedMessages.at(-1);
        }, Ia = function() {
          if (this.receivedMessages.length === 0) throw new y("stream ended without producing a Message with role=assistant");
          let t = this.receivedMessages.at(-1).content.filter((n) => n.type === "text").map((n) => n.text);
          if (t.length === 0) throw new y("stream ended without producing a content block with type=text");
          return t.join(" ");
        }, Oi = function() {
          this.ended || _(this, Ne, void 0, "f");
        }, Ci = function(t) {
          if (this.ended) return;
          let n = a(this, de, "m", Ta).call(this, t);
          switch (this._emit("streamEvent", t, n), t.type) {
            case "content_block_delta": {
              let i = n.content.at(-1);
              switch (t.delta.type) {
                case "text_delta": {
                  i.type === "text" && this._emit("text", t.delta.text, i.text || "");
                  break;
                }
                case "citations_delta": {
                  i.type === "text" && this._emit("citation", t.delta.citation, i.citations ?? []);
                  break;
                }
                case "input_json_delta": {
                  Ni(i) && a(this, ve, "f").inputJson?.length && this._emit("inputJson", t.delta.partial_json, i.input);
                  break;
                }
                case "thinking_delta": {
                  i.type === "thinking" && this._emit("thinking", t.delta.thinking, i.thinking);
                  break;
                }
                case "signature_delta": {
                  i.type === "thinking" && this._emit("signature", i.signature);
                  break;
                }
                default:
                  t.delta;
              }
              break;
            }
            case "message_stop": {
              this._addMessageParam(n), this._addMessage(Pi(n, a(this, Yt, "f"), { logger: a(this, Kr, "f") }), true);
              break;
            }
            case "content_block_stop": {
              this._emit("contentBlock", n.content.at(-1));
              break;
            }
            case "message_start": {
              _(this, Ne, n, "f");
              break;
            }
            case "content_block_start":
            case "message_delta":
              break;
          }
        }, $i = function() {
          if (this.ended) throw new y("stream has ended, this shouldn't happen");
          let t = a(this, Ne, "f");
          if (!t) throw new y("request ended without sending any chunks");
          return _(this, Ne, void 0, "f"), Pi(t, a(this, Yt, "f"), { logger: a(this, Kr, "f") });
        }, Ta = function(t) {
          let n = a(this, Ne, "f");
          if (t.type === "message_start") {
            if (n) throw new y(`Unexpected event order, got ${t.type} before receiving "message_stop"`);
            return t.message;
          }
          if (!n) throw new y(`Unexpected event order, got ${t.type} before "message_start"`);
          switch (t.type) {
            case "message_stop":
              return n;
            case "message_delta":
              return n.stop_reason = t.delta.stop_reason, n.stop_sequence = t.delta.stop_sequence, n.stop_details = t.delta.stop_details, n.usage.output_tokens = t.usage.output_tokens, t.delta.container != null && (n.container = t.delta.container), t.usage.input_tokens != null && (n.usage.input_tokens = t.usage.input_tokens), t.usage.cache_creation_input_tokens != null && (n.usage.cache_creation_input_tokens = t.usage.cache_creation_input_tokens), t.usage.cache_read_input_tokens != null && (n.usage.cache_read_input_tokens = t.usage.cache_read_input_tokens), t.usage.server_tool_use != null && (n.usage.server_tool_use = t.usage.server_tool_use), t.usage.output_tokens_details != null && (n.usage.output_tokens_details = t.usage.output_tokens_details), n;
            case "content_block_start":
              return n.content.push({ ...t.content_block }), n;
            case "content_block_delta": {
              let i = n.content.at(t.index);
              switch (t.delta.type) {
                case "text_delta": {
                  i?.type === "text" && (n.content[t.index] = { ...i, text: (i.text || "") + t.delta.text });
                  break;
                }
                case "citations_delta": {
                  i?.type === "text" && (n.content[t.index] = { ...i, citations: [...i.citations ?? [], t.delta.citation] });
                  break;
                }
                case "input_json_delta": {
                  if (i && Ni(i)) {
                    let o = (i[Oe] || "") + t.delta.partial_json;
                    n.content[t.index] = Jn(i, o);
                  }
                  break;
                }
                case "thinking_delta": {
                  i?.type === "thinking" && (n.content[t.index] = { ...i, thinking: i.thinking + t.delta.thinking });
                  break;
                }
                case "signature_delta": {
                  i?.type === "thinking" && (n.content[t.index] = { ...i, signature: t.delta.signature });
                  break;
                }
                default:
                  t.delta;
              }
              return n;
            }
            case "content_block_stop": {
              let i = n.content.at(t.index);
              return i && Ni(i) && Oe in i && Object.defineProperty(i, "input", { value: i.input, enumerable: true, configurable: true, writable: true }), n;
            }
          }
        }, Symbol.asyncIterator)]() {
          let e = [], t = [], n = false;
          return this.on("streamEvent", (i) => {
            let o = t.shift();
            o ? o.resolve(i) : e.push(i);
          }), this.on("end", () => {
            n = true;
            for (let i of t) i.resolve(void 0);
            t.length = 0;
          }), this.on("abort", (i) => {
            n = true;
            for (let o of t) o.reject(i);
            t.length = 0;
          }), this.on("error", (i) => {
            n = true;
            for (let o of t) o.reject(i);
            t.length = 0;
          }), { next: async () => e.length ? { value: e.shift(), done: false } : n ? { value: void 0, done: true } : new Promise((o, c) => t.push({ resolve: o, reject: c })).then((o) => o ? { value: o, done: false } : { value: void 0, done: true }), return: async () => (this.abort(), { value: void 0, done: true }) };
        }
        toReadableStream() {
          return new ke(this[Symbol.asyncIterator].bind(this), this.controller).toReadableStream();
        }
      }
      return r;
    })();
    Gt = class extends w {
      create(s, e) {
        let { user_profile_id: t, workspace_id: n, ...i } = s;
        return this._client.post("/v1/messages/batches", { body: i, ...e, headers: l([{ ...t != null ? { "anthropic-user-profile-id": t } : void 0, ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
      retrieve(s, e = {}, t) {
        let { workspace_id: n } = e ?? {};
        return this._client.get(h`/v1/messages/batches/${s}`, { ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { workspace_id: t, ...n } = s ?? {};
        return this._client.getAPIList("/v1/messages/batches", q, { query: n, ...e, headers: l([{ ...t != null ? { "anthropic-workspace-id": t } : void 0 }, e?.headers]) });
      }
      delete(s, e = {}, t) {
        let { workspace_id: n } = e ?? {};
        return this._client.delete(h`/v1/messages/batches/${s}`, { ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) });
      }
      cancel(s, e = {}, t) {
        let { workspace_id: n } = e ?? {};
        return this._client.post(h`/v1/messages/batches/${s}/cancel`, { ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) });
      }
      async results(s, e = {}, t) {
        let n = await this.retrieve(s, e, t);
        if (!n.results_url) throw new y(`No batch \`results_url\`; Has it finished processing? ${n.processing_status} - ${n.id}`);
        let { workspace_id: i } = e ?? {};
        return this._client.get(n.results_url, { ...t, headers: l([{ Accept: "application/binary", ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]), stream: true, __binaryResponse: true })._thenUnwrap((o, c) => Kn.fromResponse(c.response, c.controller));
      }
    };
    Vr = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.batches = new Gt(this._client);
        }
        create(e, t) {
          let { user_profile_id: n, workspace_id: i, ...o } = e;
          o.model in Oa && console.warn(`The model '${o.model}' is deprecated and will reach end-of-life on ${Oa[o.model]}
Please migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`), Iu.includes(o.model) && o.thinking && o.thinking.type === "enabled" && console.warn(`Using Claude with ${o.model} and 'thinking.type=enabled' is deprecated. Use 'thinking.type=adaptive' instead which results in better model performance in our testing: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking`);
          let c = t?.timeout ?? this._client._options.timeout;
          if (!o.stream && c == null) {
            let u = Vn[o.model] ?? void 0;
            c = this._client.calculateNonstreamingTimeout(o.max_tokens, u);
          }
          let d = yn(o.tools, o.messages);
          return this._client.post("/v1/messages", { body: o, timeout: c ?? 6e5, ...t, headers: l([{ ...n != null ? { "anthropic-user-profile-id": n } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, d, t?.headers]), stream: e.stream ?? false });
        }
        parse(e, t) {
          return this.create(e, t).then((n) => Ii(n, e, { logger: this._client.logger ?? console }));
        }
        stream(e, t) {
          return Ma.createMessage(this, e, t, { logger: this._client.logger ?? console });
        }
        countTokens(e, t) {
          let { user_profile_id: n, workspace_id: i, ...o } = e;
          return this._client.post("/v1/messages/count_tokens", { body: o, ...t, headers: l([{ ...n != null ? { "anthropic-user-profile-id": n } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
        }
      }
      return r.Batches = Gt, r;
    })();
    Oa = {};
    Iu = ["claude-mythos-preview", "claude-opus-4-6"];
    Ze = class extends w {
      retrieve(s, e = {}, t) {
        let { betas: n, workspace_id: i } = e ?? {};
        return this._client.get(h`/v1/models/${s}`, { ...t, headers: l([{ ...n?.toString() != null ? { "anthropic-beta": n?.toString() } : void 0, ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      list(s = {}, e) {
        let { betas: t, workspace_id: n, ...i } = s ?? {};
        return this._client.getAPIList("/v1/models", q, { query: i, ...e, headers: l([{ ...t?.toString() != null ? { "anthropic-beta": t?.toString() } : void 0, ...n != null ? { "anthropic-workspace-id": n } : void 0 }, e?.headers]) });
      }
    };
    Xt = class extends w {
      create(s, e, t) {
        let { workspace_id: n, ...i } = e;
        return this._client.post(h`/v1/skills/${s}/versions`, ce({ body: i, ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) }, this._client, false));
      }
      retrieve(s, e, t) {
        let { skill_id: n, workspace_id: i } = e;
        return this._client.get(h`/v1/skills/${n}/versions/${s}`, { ...t, headers: l([{ ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
      list(s, e = {}, t) {
        let { workspace_id: n, ...i } = e ?? {};
        return this._client.getAPIList(h`/v1/skills/${s}/versions`, S, { query: i, ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) });
      }
      delete(s, e, t) {
        let { skill_id: n, workspace_id: i } = e;
        return this._client.delete(h`/v1/skills/${n}/versions/${s}`, { ...t, headers: l([{ ...i != null ? { "anthropic-workspace-id": i } : void 0 }, t?.headers]) });
      }
    };
    Jr = (() => {
      class r extends w {
        constructor() {
          super(...arguments), this.versions = new Xt(this._client);
        }
        create(e, t) {
          let { workspace_id: n, ...i } = e;
          return this._client.post("/v1/skills", ce({ body: i, ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) }, this._client, false));
        }
        retrieve(e, t = {}, n) {
          let { workspace_id: i } = t ?? {};
          return this._client.get(h`/v1/skills/${e}`, { ...n, headers: l([{ ...i != null ? { "anthropic-workspace-id": i } : void 0 }, n?.headers]) });
        }
        list(e = {}, t) {
          let { workspace_id: n, ...i } = e ?? {};
          return this._client.getAPIList("/v1/skills", S, { query: i, ...t, headers: l([{ ...n != null ? { "anthropic-workspace-id": n } : void 0 }, t?.headers]) });
        }
        delete(e, t = {}, n) {
          let { workspace_id: i } = t ?? {};
          return this._client.delete(h`/v1/skills/${e}`, { ...n, headers: l([{ ...i != null ? { "anthropic-workspace-id": i } : void 0 }, n?.headers]) });
        }
      }
      return r.Versions = Xt, r;
    })();
    Ou = "\\n\\nHuman:";
    Cu = "\\n\\nAssistant:";
    $u = (() => {
      class r {
        get credentials() {
          return this._authState.provider;
        }
        constructor({ baseURL: e = P("ANTHROPIC_BASE_URL"), apiKey: t, authToken: n, webhookKey: i = P("ANTHROPIC_WEBHOOK_SIGNING_KEY") ?? null, ...o } = {}) {
          if (Li.add(this), this._requestAuthFlags = /* @__PURE__ */ new WeakMap(), Ss.set(this, void 0), t === void 0 && (t = o.profile != null ? null : P("ANTHROPIC_API_KEY") ?? null), n === void 0 && (n = o.profile != null ? null : P("ANTHROPIC_AUTH_TOKEN") ?? null), o.profile != null && (o.credentials != null || o.config != null)) throw new TypeError("Pass at most one of `profile`, `credentials`, or `config`.");
          let c = { apiKey: t, authToken: n, webhookKey: i, ...o, baseURL: e || "https://api.anthropic.com" };
          if (!c.dangerouslyAllowBrowser && zi()) throw new y(`It looks like you're running in a browser-like environment.

This is disabled by default, as it risks exposing your secret API credentials to attackers.
If you understand the risks and have appropriate mitigations in place,
you can set the \`dangerouslyAllowBrowser\` option to \`true\`, e.g.,

new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
`);
          this.baseURL = c.baseURL, this._baseURLIsExplicit = o.__baseURLIsExplicit ?? !!e, this.timeout = c.timeout ?? Fi.DEFAULT_TIMEOUT, this.logger = c.logger ?? console, this.logLevel = fr, this.logLevel = dn(c.logLevel, "ClientOptions.logLevel", T(this)) ?? dn(P("ANTHROPIC_LOG"), "process.env['ANTHROPIC_LOG']", T(this)) ?? fr, this.fetchOptions = c.fetchOptions, this.maxRetries = Xr("maxRetries", c.maxRetries ?? 2), this.fetch = c.fetch ?? Yi(), _(this, Ss, Xi, "f"), this.middleware = [...c.middleware ?? []];
          let d = P("ANTHROPIC_CUSTOM_HEADERS");
          if (d) {
            let p = {};
            for (let f of d.split(`
`)) {
              let m = f.indexOf(":");
              m >= 0 && (p[f.substring(0, m).trim()] = f.substring(m + 1).trim());
            }
            c.defaultHeaders = { ...p, ...c.defaultHeaders };
          }
          let u = o.__auth;
          if (delete c.__auth, delete c.__baseURLIsExplicit, this._options = c, this.apiKey = typeof t == "string" ? t : null, this.authToken = n, this.webhookKey = i, u) this._authState = u, !this._baseURLIsExplicit && u.baseURL && (this.baseURL = u.baseURL);
          else if (this._authState = { provider: null, tokenCache: null, resolution: null, error: null, extraHeaders: {} }, this.apiKey == null && this.authToken == null) {
            let p = c.credentials ?? null;
            if (p) this._authState.provider = p, this._authState.tokenCache = this._makeTokenCache(p);
            else if (c.config != null) {
              let f = Bs(c.config, this._credentialResolverOptions());
              this._authState.provider = f.provider, this._authState.tokenCache = this._makeTokenCache(f.provider), this._authState.extraHeaders = f.extraHeaders, this._applyCredentialBaseURL(f.baseURL);
            } else c.profile != null ? this._authState.resolution = this._resolveDefaultCredentials(c.profile) : this._shouldResolveDefaultCredentials() && (this._authState.resolution = this._resolveDefaultCredentials());
          }
        }
        _shouldResolveDefaultCredentials() {
          return true;
        }
        _applyCredentialBaseURL(e) {
          if (!e) return;
          let t = e.replace(/\/+$/, "");
          this._authState.baseURL = t, this._baseURLIsExplicit || (this.baseURL = t);
        }
        _credentialResolverOptions() {
          return { baseURL: this.baseURL, fetch: this._credentialsFetch(), userAgent: this.getUserAgent(), onCacheWriteError: (e) => {
            T(this).debug("credential cache write failed (best-effort)", e);
          }, onSafetyWarning: (e) => {
            T(this).warn(e);
          } };
        }
        _credentialsFetch() {
          return qs(this.fetch, this.middleware, void 0, this);
        }
        _makeTokenCache(e) {
          return new cn(e, (t) => {
            T(this).debug("advisory token refresh failed; serving cached token", t);
          });
        }
        withOptions(e) {
          let t = "credentials" in e || "config" in e || "profile" in e, n = "apiKey" in e || "authToken" in e || t, i = { ...this._options, ...this._baseURLIsExplicit ? { baseURL: this.baseURL } : {}, maxRetries: this.maxRetries, timeout: this.timeout, logger: this.logger, logLevel: this.logLevel, fetch: this.fetch, fetchOptions: this.fetchOptions, middleware: this.middleware, apiKey: this.apiKey, authToken: this.authToken, webhookKey: this.webhookKey, credentials: this.credentials, ...t ? { credentials: void 0, config: void 0, profile: void 0 } : {}, ...e, __auth: n ? void 0 : this._authState, __baseURLIsExplicit: "baseURL" in e ? true : this._baseURLIsExplicit };
          return new this.constructor(i);
        }
        async _resolveDefaultCredentials(e) {
          try {
            let t = await Po(this._credentialResolverOptions(), e);
            if (t) this._authState.provider = t.provider, this._authState.tokenCache = this._makeTokenCache(t.provider), this._authState.extraHeaders = t.extraHeaders, this._applyCredentialBaseURL(t.baseURL);
            else if (e != null) throw new y(`Profile "${e}" could not be resolved (no <config_dir>/configs/${e}.json found).`);
          } catch (t) {
            this._authState.error = t;
          } finally {
            this._authState.resolution = null;
          }
        }
        defaultQuery() {
          return this._options.defaultQuery;
        }
        validateHeaders({ values: e, nulls: t }) {
          if (!(e.get("x-api-key") || e.get("authorization"))) {
            if (this._authState.error) throw this._authState.error;
            if (!(this._authState.tokenCache || this._authState.resolution) && !(this.apiKey && e.get("x-api-key")) && !t.has("x-api-key") && !(this.authToken && e.get("authorization")) && !t.has("authorization")) throw new Error('Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set. Or for one of the "X-Api-Key" or "Authorization" headers to be explicitly omitted');
          }
        }
        _authFlags(e) {
          let t = this._requestAuthFlags.get(e);
          return t || (t = { usedTokenCache: false, didRefreshFor401: false }, this._requestAuthFlags.set(e, t)), t;
        }
        async authHeaders(e) {
          if (this._authState.resolution && await this._authState.resolution, !this._authState.error) {
            if (this._authState.tokenCache && this.apiKey == null) {
              let t = await this._authState.tokenCache.getToken();
              return this._authFlags(e).usedTokenCache = true, l([{ Authorization: `Bearer ${t}` }]);
            }
            return l([await this.apiKeyAuth(e), await this.bearerAuth(e)]);
          }
        }
        async apiKeyAuth(e) {
          if (this.apiKey != null) return l([{ "X-Api-Key": this.apiKey }]);
        }
        async bearerAuth(e) {
          if (this.authToken != null) return l([{ Authorization: `Bearer ${this.authToken}` }]);
        }
        stringifyQuery(e) {
          return oo(e);
        }
        getUserAgent() {
          return `Anthropic/JS ${ae}`;
        }
        makeStatusError(e, t, n, i) {
          return D.generate(e, t, n, i);
        }
        buildURL(e, t, n) {
          let i = !a(this, Li, "m", Ca).call(this) && n || this.baseURL, o = Bi(e) ? new URL(e) : new URL(i + (i.endsWith("/") && e.startsWith("/") ? e.slice(1) : e)), c = this.defaultQuery(), d = Object.fromEntries(o.searchParams);
          return (!Rs(c) || !Rs(d)) && (t = { ...d, ...c, ...t }), typeof t == "object" && t && !Array.isArray(t) && (o.search = this.stringifyQuery(t)), o.toString();
        }
        _calculateNonstreamingTimeout(e) {
          if (3600 * e / 128e3 > 600) throw new y("Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#streaming-responses for more details");
          return 600 * 1e3;
        }
        async prepareOptions(e) {
        }
        async prepareRequest(e, { url: t, options: n }) {
          if (this._authState.tokenCache && this.apiKey == null) {
            let i = e.headers instanceof Headers ? e.headers : new Headers(e.headers);
            for (let [c, d] of Object.entries(this._authState.extraHeaders)) i.has(c) || i.set(c, d);
            let o = i.get("anthropic-beta")?.split(",").map((c) => c.trim());
            o?.includes(Be) || i.set("anthropic-beta", [...o ?? [], Be].join(",")), e.headers = i;
          }
        }
        backendMiddleware() {
          return [];
        }
        get(e, t) {
          return this.methodRequest("get", e, t);
        }
        post(e, t) {
          return this.methodRequest("post", e, t);
        }
        patch(e, t) {
          return this.methodRequest("patch", e, t);
        }
        put(e, t) {
          return this.methodRequest("put", e, t);
        }
        delete(e, t) {
          return this.methodRequest("delete", e, t);
        }
        methodRequest(e, t, n) {
          return this.request(Promise.resolve(n).then((i) => ({ method: e, path: t, ...i })));
        }
        request(e, t = null) {
          return new mn(this, this.makeRequest(e, t, void 0));
        }
        async makeRequest(e, t, n) {
          let i = await e, o = Xr("maxRetries", i.maxRetries ?? this.maxRetries);
          this.isStreamBody(i.body) && (o = 0), t == null && (t = o, this._requestAuthFlags.delete(i)), await this.prepareOptions(i);
          let { req: c, url: d, timeout: u } = await this.buildRequest(i, { retryCount: o - t }), p = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0"), f = n === void 0 ? "" : `, retryOf: ${n}`, m = Date.now();
          if (i.signal?.aborted) throw new J();
          let b = new AbortController(), g = await this.fetchWithTimeout(d, c, u, b, i, { requestLogID: p, retryOfRequestLogID: n }).catch(Fe), x = Date.now();
          if (g instanceof globalThis.Error) {
            _e(b);
            let k = `retrying, ${t} attempts remaining`;
            if (i.signal?.aborted) throw new J();
            let I = he(g) || /timed? ?out/i.test(String(g) + ("cause" in g ? String(g.cause) : "")), v = this.middleware.length > 0 || !!i.middleware?.length || this.backendMiddleware().length > 0;
            if (v && !I && !Co(g)) throw T(this).info(`[${p}] middleware error (not retryable)`), ye(T(this), `[${p}] middleware error (not retryable)`, { retryOfRequestLogID: n, url: d, durationMs: x - m, message: g.message }), g;
            if (t) return T(this).info(`[${p}] connection ${I ? "timed out" : "failed"} - ${k}`), ye(T(this), `[${p}] connection ${I ? "timed out" : "failed"} (${k})`, { retryOfRequestLogID: n, url: d, durationMs: x - m, message: g.message }), this.retryRequest(i, t, n ?? p);
            throw T(this).info(`[${p}] connection ${I ? "timed out" : "failed"} - error; no more retries left`), ye(T(this), `[${p}] connection ${I ? "timed out" : "failed"} (error; no more retries left)`, { retryOfRequestLogID: n, url: d, durationMs: x - m, message: g.message }), I ? new Zt() : v && !Us(g) ? g : new Ae({ cause: g });
          }
          let A = [...g.headers.entries()].filter(([k]) => k === "request-id" || k === "anthropic-workspace-id").map(([k, I]) => ", " + k + ": " + JSON.stringify(I)).join(""), E = `[${p}${f}${A}] ${c.method} ${d} ${g.ok ? "succeeded" : "failed"} with status ${g.status} in ${x - m}ms`;
          if (!g.ok) {
            let k = await this.shouldRetry(g, i);
            if (t && k) {
              let N = `retrying, ${t} attempts remaining`;
              return await Gi(g.body), _e(b), T(this).info(`${E} - ${N}`), ye(T(this), `[${p}] response error (${N})`, { retryOfRequestLogID: n, url: g.url, status: g.status, headers: g.headers, durationMs: x - m }), this.retryRequest(i, t, n ?? p, g.headers);
            }
            let I = k ? "error; no more retries left" : "error; not retryable";
            T(this).info(`${E} - ${I}`);
            let v = await g.text().catch((N) => Fe(N).message), R = Qr(v), $ = R ? void 0 : v;
            throw ye(T(this), `[${p}] response error (${I})`, { retryOfRequestLogID: n, url: g.url, status: g.status, headers: g.headers, message: $, durationMs: Date.now() - m }), _e(b), this.makeStatusError(g.status, R, $, g.headers);
          }
          return T(this).info(E), ye(T(this), `[${p}] response start`, { retryOfRequestLogID: n, url: g.url, status: g.status, headers: g.headers, durationMs: x - m }), Ji(g.body ?? g, b), { response: g, options: i, controller: b, requestLogID: p, retryOfRequestLogID: n, startTime: m };
        }
        getAPIList(e, t, n) {
          return this.requestAPIList(t, n && "then" in n ? n.then((i) => ({ method: "get", path: e, ...i })) : { method: "get", path: e, ...n });
        }
        requestAPIList(e, t) {
          let n = this.makeRequest(t, null, void 0);
          return new $o(this, n, e);
        }
        async fetchWithTimeout(e, t, n, i, o, c) {
          let { signal: d, method: u, ...p } = t || {}, f = this._makeAbort(i);
          d && (d.addEventListener("abort", f, { once: true }), Vi(i, d, f));
          let m = globalThis.ReadableStream && p.body instanceof globalThis.ReadableStream || typeof p.body == "object" && p.body !== null && Symbol.asyncIterator in p.body, b = { signal: i.signal, ...m ? { duplex: "half" } : {}, method: "GET", ...p };
          u && (b.method = u.toUpperCase());
          let g = this.fetch, x = async (v, R) => {
            let $ = setTimeout(f, n);
            try {
              return await g.call(void 0, v, R);
            } finally {
              clearTimeout($);
            }
          }, A = o === void 0 ? x : (async (v, R = {}) => {
            let $ = typeof v == "string" ? v : v instanceof URL ? v.href : v.url;
            return R.headers = R.headers instanceof Headers ? R.headers : new Headers(R.headers), await this.prepareRequest(R, { url: $, options: o }), c && ye(T(this), `[${c.requestLogID}] sending request`, { retryOfRequestLogID: c.retryOfRequestLogID, method: R.method, url: $, options: o, headers: R.headers }), x(v, R);
          }), E = o?.middleware, k = this.backendMiddleware(), I = E?.length || k.length ? [...this.middleware, ...E ?? [], ...k] : this.middleware;
          return await qs(A, I, o, this)(e, b);
        }
        async shouldRetry(e, t) {
          let n = this._authFlags(t);
          if (e.status === 401 && this._authState.tokenCache && n.usedTokenCache && !n.didRefreshFor401) return n.didRefreshFor401 = true, this._authState.tokenCache.invalidate(), true;
          let i = e.headers.get("x-should-retry");
          return i === "true" ? true : i === "false" ? false : e.status === 408 || e.status === 409 || e.status === 429 || e.status >= 500;
        }
        async retryRequest(e, t, n, i) {
          let o, c = i?.get("retry-after-ms");
          if (c) {
            let u = parseFloat(c);
            Number.isNaN(u) || (o = u);
          }
          let d = i?.get("retry-after");
          if (d && !o) {
            let u = parseFloat(d);
            Number.isNaN(u) ? o = Date.parse(d) - Date.now() : o = u * 1e3;
          }
          if (o === void 0 || !(o > 0 && o <= 2 ** 31 - 1)) {
            let u = e.maxRetries ?? this.maxRetries;
            o = this.calculateDefaultRetryTimeoutMillis(t, u);
          }
          return await fe(o, e.signal ?? void 0), this.makeRequest(e, t - 1, n);
        }
        calculateDefaultRetryTimeoutMillis(e, t) {
          let o = t - e, c = Math.min(0.5 * Math.pow(2, o), 8), d = 1 - Math.random() * 0.25;
          return c * d * 1e3;
        }
        calculateNonstreamingTimeout(e, t) {
          if (36e5 * e / 128e3 > 6e5 || t != null && e > t) throw new y("Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#long-requests for more details");
          return 6e5;
        }
        async buildRequest(e, { retryCount: t = 0 } = {}) {
          let n = { ...e }, { method: i, path: o, query: c, defaultBaseURL: d } = n;
          this._authState.resolution && await this._authState.resolution, !this._baseURLIsExplicit && this._authState.baseURL && this.baseURL !== this._authState.baseURL && (this.baseURL = this._authState.baseURL);
          let u = this.buildURL(o, c, d);
          "timeout" in n && Xr("timeout", n.timeout), n.timeout = n.timeout ?? this.timeout;
          let { bodyHeaders: p, body: f } = this.buildBody({ options: n }), m = await this.buildHeaders({ options: e, method: i, bodyHeaders: p, retryCount: t });
          return { req: { method: i, headers: m, ...n.signal && { signal: n.signal }, ...globalThis.ReadableStream && f instanceof globalThis.ReadableStream && { duplex: "half" }, ...f && { body: f }, ...this.fetchOptions ?? {}, ...n.fetchOptions ?? {} }, url: u, timeout: n.timeout };
        }
        async buildHeaders({ options: e, method: t, bodyHeaders: n, retryCount: i }) {
          let o = l([{ Accept: "application/json", "User-Agent": this.getUserAgent(), "X-Stainless-Retry-Count": String(i), ...e.timeout ? { "X-Stainless-Timeout": String(Math.trunc(e.timeout / 1e3)) } : {}, ...lr(), ...this._options.dangerouslyAllowBrowser ? { "anthropic-dangerous-direct-browser-access": "true" } : void 0, "anthropic-version": "2023-06-01" }, await this.authHeaders(e), this._options.defaultHeaders, n, e.headers]);
          return this.validateHeaders(o), o.values;
        }
        _makeAbort(e) {
          return () => e.abort();
        }
        buildBody({ options: { body: e, headers: t } }) {
          if (!e) return { bodyHeaders: void 0, body: void 0 };
          let n = l([t]);
          return ArrayBuffer.isView(e) || e instanceof ArrayBuffer || e instanceof DataView || typeof e == "string" && n.values.has("content-type") || globalThis.Blob && e instanceof globalThis.Blob || e instanceof FormData || e instanceof URLSearchParams || globalThis.ReadableStream && e instanceof globalThis.ReadableStream ? { bodyHeaders: void 0, body: e } : this.isStreamBody(e) ? { bodyHeaders: void 0, body: en(e) } : typeof e == "object" && n.values.get("content-type") === "application/x-www-form-urlencoded" ? { bodyHeaders: { "content-type": "application/x-www-form-urlencoded" }, body: this.stringifyQuery(e) } : a(this, Ss, "f").call(this, { body: e, headers: n });
        }
        isStreamBody(e) {
          return globalThis.ReadableStream && e instanceof globalThis.ReadableStream ? true : typeof e == "object" && e !== null && (Symbol.asyncIterator in e || Symbol.iterator in e && "next" in e && typeof e.next == "function");
        }
      }
      return Fi = r, Ss = /* @__PURE__ */ new WeakMap(), Li = /* @__PURE__ */ new WeakSet(), Ca = function() {
        return this.baseURL !== "https://api.anthropic.com";
      }, r.Anthropic = Fi, r.HUMAN_PROMPT = Ou, r.AI_PROMPT = Cu, r.DEFAULT_TIMEOUT = 6e5, r.AnthropicError = y, r.APIError = D, r.APIConnectionError = Ae, r.APIConnectionTimeoutError = Zt, r.APIUserAbortError = J, r.NotFoundError = nr, r.ConflictError = sr, r.RateLimitError = or, r.BadRequestError = er, r.AuthenticationError = tr, r.InternalServerError = ar, r.PermissionDeniedError = rr, r.UnprocessableEntityError = ir, r.toFile = Ys, r;
    })();
    $a = (() => {
      class r extends $u {
        constructor() {
          super(...arguments), this.completions = new Ge(this), this.messages = new Vr(this), this.models = new Ze(this), this.files = new Xe(this), this.skills = new Jr(this), this.beta = new Br(this);
        }
      }
      return r.Completions = Ge, r.Messages = Vr, r.Models = Ze, r.Files = Xe, r.Skills = Jr, r.Beta = Br, r;
    })();
    L();
    Nu = /* @__PURE__ */ new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);
  }
});

// prueba/js/vendedor.js
var VENTAS_BASE = {
  activo: true,
  tasaAnual: 15.9,
  // referencial, sin IVA ni seguro: siempre se aclara al cliente
  engancheMinimo: 20,
  // % del precio
  plazos: [24, 36, 48, 60],
  horasConAsesor: 12,
  // al pedir asesor o anotar una visita, Sofía deja esa conversación al asesor
  presentacion: "",
  // cómo saluda en el primer mensaje; vacío = "¡Hola {nombre}! 👋"
  ia: false
  // con IA (opcional, de pago): contesta lo que el menú no entiende, con los mismos datos y reglas
};
var MAX_POR_HORA = 15;
var HORA = 3600 * 1e3;
var MAX_LISTA = 10;
var sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var compacto = (s) => sinAcentos(s).replace(/[-_]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function contienePalabra(texto, palabra) {
  const p = sinAcentos(palabra).trim();
  if (!p) return false;
  const re2 = new RegExp(`(^|[^\\p{L}\\p{N}])${escaparRegex(p).replace(/\s+/g, "\\s+")}(?=$|[^\\p{L}\\p{N}])`, "u");
  return re2.test(sinAcentos(texto));
}
var tieneAlguna = (t, lista) => lista.some((p) => contienePalabra(t, p));
function primerNombre(nombre) {
  const t = String(nombre ?? "").normalize("NFC").split(/\s+/).map((x) => x.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")).find(Boolean) ?? "";
  if (t.length > 30 || !/^\p{L}[\p{L}\p{M}'’.-]*$/u.test(t)) return "";
  return t === t.toUpperCase() || t === t.toLowerCase() ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}
function rellenar(plantilla, vars) {
  const t = plantilla.replace(/\{(nombre|asesor|agencia)\}/gi, (_2, k) => vars[k.toLowerCase()] ?? "").replace(/[ \t]+([,.!?;:])/g, "$1").replace(/([¡¿])[ \t]+/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
  const sinInicio = t.replace(/^[,.;:]+\s*/, "");
  return sinInicio === t ? t : sinInicio.charAt(0).toUpperCase() + sinInicio.slice(1);
}
var TITULO = /^(licenciad[oa]|lic\.?da|lic|ingenier[oa]|ing\.?a|ing|señora|señor|sra|sr|doctora|doctor|dra|dr|arquitect[oa]|arq|contador[a]?|c\.\s?p)\.?\s+/i;
function asesorCon(nombre, prep = "") {
  const n = String(nombre ?? "").trim();
  const la2 = /^(licenciada|lic\.?da|ingeniera|ing\.?a|sra|señora|dra|doctora|contadora|arquitecta)\.?(\s|$)/i.test(n);
  const el2 = !la2 && /^(lic|licenciado|ing|ingeniero|sr|señor|dr|doctor|arq|arquitecto|c\.\s?p|contador)\.?(\s|$)/i.test(n);
  const art = la2 ? "la" : el2 ? "el" : "";
  if (!art) return prep ? `${prep} ${n}` : n;
  if (art === "el" && prep === "a") return `al ${n}`;
  if (art === "el" && prep === "de") return `del ${n}`;
  return prep ? `${prep} ${art} ${n}` : `${art} ${n}`;
}
var mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
var FORMATO = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
var pesos = (n) => `$${FORMATO.format(Math.round(n))}`;
var DIAS_CORTOS = ["dom", "lun", "mar", "mi\xE9", "jue", "vie", "s\xE1b"];
function textoHorario(horario) {
  const dias = [...new Set(horario?.dias ?? [])].sort((a2, b) => a2 - b);
  if (!dias.length) return "";
  const hora = (x) => String(x ?? "").replace(/^0(\d)/, "$1");
  const seguidos = dias.every((d2, i) => i === 0 || d2 === dias[i - 1] + 1);
  const d = dias.length === 7 ? "todos los d\xEDas" : dias.length > 2 && seguidos ? `${DIAS_CORTOS[dias[0]]} a ${DIAS_CORTOS[dias.at(-1)]}` : dias.map((x) => DIAS_CORTOS[x]).join(", ");
  return horario.inicio === horario.fin ? `${d}, todo el d\xEDa` : `${d} de ${hora(horario.inicio)} a ${hora(horario.fin)}`;
}
function mensualidad(monto, tasaAnual, meses) {
  if (!(monto > 0) || !(meses > 0)) return 0;
  const r = (Number(tasaAnual) || 0) / 100 / 12;
  return r ? monto * r / (1 - (1 + r) ** -meses) : monto / meses;
}
function leerEnganche(texto, precio) {
  const t = sinAcentos(texto).replace(/\$/g, " ");
  if (/\b(nada|sin enganche|cero)\b/.test(t)) return 0;
  const pct = /(\d{1,2}(?:[.,]\d+)?)\s*(%|por\s*ciento)/.exec(t);
  if (pct) return precio * Number(pct[1].replace(",", ".")) / 100;
  const mill = /(\d+(?:[.,]\d+)?)\s*(millon(es)?|mdp)\b/.exec(t);
  if (mill) return Number(mill[1].replace(",", ".")) * 1e6;
  const mil = /(\d+(?:[.,]\d+)?)\s*(mil|k)\b/.exec(t);
  if (mil) return Number(mil[1].replace(",", ".")) * 1e3;
  const n = /(\d{1,3}(?:[,. ]\d{3})+|\d+)/.exec(t);
  if (!n) return null;
  const v = Number(n[1].replace(/[,. ]/g, ""));
  if (v < 100) return precio * v / 100;
  return v < 1e4 ? v * 1e3 : v;
}
var nombreAuto = (a2) => [a2.marca, a2.modelo, a2.version, a2.anio].filter(Boolean).join(" ");
var disponibles = (inv) => (inv ?? []).filter((a2) => a2 && a2.disponible !== false && (a2.modelo || a2.marca));
function buscarAutos(texto, inventario) {
  const t = compacto(texto);
  const autos = disponibles(inventario);
  const clave = (s) => compacto(s);
  let hits = autos.filter((a2) => [a2.modelo, `${a2.marca} ${a2.modelo}`, ...a2.palabras ?? []].map(clave).some((k) => k.length >= 2 && !/^\d+$/.test(k) && contienePalabra(t, k)));
  if (!hits.length) hits = autos.filter((a2) => clave(a2.marca).length >= 3 && contienePalabra(t, clave(a2.marca)));
  const anio = /\b(19|20)\d{2}\b/.exec(t)?.[0];
  if (anio && hits.length > 1) {
    const mismos = hits.filter((a2) => String(a2.anio) === anio);
    if (mismos.length) hits = mismos;
  }
  return hits;
}
var DIAS_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
var DIAS_LARGOS = ["domingo", "lunes", "martes", "mi\xE9rcoles", "jueves", "viernes", "s\xE1bado"];
var aMin = (hhmm) => {
  const [h2, m] = String(hhmm).split(":").map(Number);
  return h2 * 60 + (m || 0);
};
function local(fecha, zona) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zona, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(fecha).map((x) => [x.type, x.value]));
  return { dia: DIAS_EN[p.weekday], fecha: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), diaMes: Number(p.day) };
}
function textoCita(iso, zona = "America/Monterrey", ahora = /* @__PURE__ */ new Date()) {
  const t = new Date(iso);
  const l2 = local(t, zona);
  const hoy = local(ahora, zona).fecha;
  const manana = local(new Date(ahora.getTime() + 24 * HORA), zona).fecha;
  const h24 = Math.floor(l2.min / 60);
  const h12 = h24 % 12 || 12;
  const min = l2.min % 60;
  const hora = `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${h24 < 12 ? "am" : "pm"}`;
  const dia = l2.fecha === hoy ? "hoy" : l2.fecha === manana ? `ma\xF1ana ${DIAS_LARGOS[l2.dia]}` : `el ${DIAS_LARGOS[l2.dia]} ${l2.diaMes}`;
  return `${dia} ${h12 === 1 ? "a la" : "a las"} ${hora}`;
}
function horariosLibres({ horario, zonaHoraria = "America/Monterrey", ocupadas = [], ahora = /* @__PURE__ */ new Date(), dias = 7, duracionMin = 60, anticipacionMin = 90, cuantos = 60 } = {}) {
  const h2 = horario?.dias?.length ? horario : { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" };
  const ini = aMin(h2.inicio);
  const fin = h2.inicio === h2.fin ? 24 * 60 : aMin(h2.fin);
  const tomadas = new Set(ocupadas.map((x) => new Date(x).toISOString()));
  const salida = [];
  let t = Math.ceil((ahora.getTime() + anticipacionMin * 6e4) / HORA) * HORA;
  const hasta = ahora.getTime() + dias * 24 * HORA;
  for (; t <= hasta && salida.length < cuantos; t += HORA) {
    const fecha = new Date(t);
    const l2 = local(fecha, zonaHoraria);
    if (!h2.dias.includes(l2.dia) || l2.min < ini || l2.min + duracionMin > fin) continue;
    const id = fecha.toISOString();
    if (!tomadas.has(id)) salida.push({ id, texto: textoCita(id, zonaHoraria, ahora), fecha: l2.fecha, min: l2.min });
  }
  return salida;
}
function tresOpciones(libres) {
  const elegidas = [];
  const agregar = (x) => {
    if (x && !elegidas.includes(x) && elegidas.length < 3) elegidas.push(x);
  };
  agregar(libres[0]);
  agregar(libres.find((x) => x.min >= 15 * 60 && !elegidas.includes(x)));
  agregar(libres.find((x) => !elegidas.some((e) => e.fecha === x.fecha)));
  for (const x of libres) agregar(x);
  return elegidas.sort((a2, b) => a2.id.localeCompare(b.id));
}
var DICE = {
  asesor: ["asesor", "asesora", "vendedor", "vendedora", "una persona", "humano", "hablar con alguien", "llamenme", "llamame", "marcame", "me pueden llamar", "me puedes llamar", "una llamada"],
  cita: ["prueba de manejo", "manejar", "manejarlo", "manejarla", "probarlo", "probarla", "cita", "agendar", "agenda", "visitarlos", "ir a verlo", "ir a verla", "conocerlo", "conocerla", "puedo ir", "pasar a verlo", "pasar a verla", "visita", "ir a la agencia", "pasar a la agencia"],
  credito: ["credito", "financiamiento", "financiar", "financiado", "mensualidad", "mensualidades", "a meses", "plazos", "enganche", "cotizacion", "cotizar", "cotiza", "cotizame"],
  contado: ["contado", "de contado", "efectivo", "cash"],
  lista: ["catalogo", "inventario", "autos", "carros", "coches", "camionetas", "disponibles", "que tienen", "que tienes", "modelos", "unidades", "seminuevos", "nuevos"],
  precio: ["precio", "precios", "cuanto cuesta", "cuanto sale", "cuanto vale", "costo", "en cuanto", "cuanto es"],
  saludo: ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "que tal", "informacion", "info"],
  gracias: ["gracias", "muchas gracias", "mil gracias"]
};
var MENU = ["menu", "inicio", "opciones", "regresar", "volver"];
var MODELOS_HONDA = [["city", "City"], ["civic", "Civic"], ["accord", "Accord"], ["hrv", "HR-V"], ["brv", "BR-V"], ["crv", "CR-V"], ["pilot", "Pilot"], ["odyssey", "Odyssey"]];
var modeloMencionado = (texto) => {
  const t = compacto(texto);
  return MODELOS_HONDA.find(([k]) => contienePalabra(t, k))?.[1] ?? null;
};
var femenino = (m) => ["HR-V", "BR-V", "CR-V", "Pilot", "Odyssey"].includes(m);
var delModelo = (m) => femenino(m) ? `de la ${m}` : `del ${m}`;
var NO_SABE = ["no se", "no lo se", "no tengo", "ninguno", "nada", "sin enganche", "lo minimo", "el minimo", "lo que sea", "no estoy seguro", "no estoy segura", "depende"];
function engancheDicho(texto) {
  const t = sinAcentos(texto);
  const pct = /(\d{1,2}(?:[.,]\d+)?)\s*(%|por\s*ciento)/.exec(t);
  if (pct) {
    const n2 = Number(pct[1].replace(",", "."));
    return n2 > 0 && n2 < 100 ? { texto: `${n2}%`, pct: n2 } : null;
  }
  if (!montoExplicito(texto)) return null;
  const n = leerEnganche(texto, 0);
  if (!(n >= 1e3)) return null;
  const monto = Math.round(n);
  return { texto: monto % 1e3 === 0 && monto < 1e6 ? `${monto / 1e3} mil` : pesos(monto), monto };
}
var NUMEROS = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
function numeroElegido(texto) {
  const t = sinAcentos(texto).replace(/[^\p{L}\p{N}#\s]/gu, " ").trim();
  const m = /^(?:(?:opcion|la|el|numero|num|no|#)\s*)?(\d{1,2}|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)$/.exec(t);
  if (!m) return null;
  return NUMEROS[m[1]] ?? Number(m[1]);
}
var montoExplicito = (texto) => /(\d\s*(%|por\s*ciento|mil\b|k\b|millon|mdp))|\$\s*\d|\d{1,3}([,.]\d{3})+|\d{4,}/.test(sinAcentos(texto));
var pareceFecha = (t) => /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|pasado|fin de semana|finde|semana|tarde|noche|mediodia|\d{1,2}\s*(:\d{2})?\s*(am|pm|hrs?|h)\b|\d{1,2}[/-]\d{1,2}|\d{1,2} de \w+)/.test(sinAcentos(t));
var OPCIONES_MENU = ["lista", "credito", "cita", "asesor"];
var emojiNum = (i) => ["1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3", "9\uFE0F\u20E3", "\u{1F51F}"][i] ?? `${i + 1}.`;
var enumerar = (lineas) => lineas.map((l2, i) => `${emojiNum(i)} ${l2}`).join("\n");
function decidir({ cfg = {}, inventario = [], conv = {}, msg = {}, ahora = /* @__PURE__ */ new Date(), libres = [] }) {
  const v = { ...VENTAS_BASE, ...cfg.ventas ?? {} };
  const now = ahora instanceof Date ? ahora : new Date(ahora);
  const c = { ...conv, autos: (conv.autos ?? []).filter((x) => now - new Date(x) < HORA), fallos: conv.fallos ?? 0 };
  const lead = {};
  const texto = String(msg.texto ?? "");
  const t = sinAcentos(texto);
  const vars = { nombre: primerNombre(msg.nombre), asesor: cfg.asesor || "tu asesor", agencia: cfg.agencia || "la agencia" };
  const asesor = cfg.asesor ? asesorCon(cfg.asesor) : "un asesor";
  const Asesor = mayus(asesor);
  const aAsesor = cfg.asesor ? asesorCon(cfg.asesor, "a") : "a un asesor";
  const horario = textoHorario(cfg.horario);
  const autos = disponibles(inventario);
  const porId = (id) => autos.find((a2) => a2.id === id);
  const quedar = (motivo2) => ({ respuestas: [], conv: c, lead, motivo: motivo2 });
  if (c.autos.length >= MAX_POR_HORA) return quedar("freno");
  const pideMenu = t.trim() === "0" || texto.trim().split(/\s+/).length <= 3 && tieneAlguna(t, MENU);
  const limpio = sinAcentos(texto).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(borra|borrar|borren|elimina|eliminar|eliminen) (todos )?mis datos\b/.test(limpio)) {
    Object.assign(lead, { pideBorrar: true, quiereAsesor: true });
    Object.assign(c, { paso: "asesor", desde: now.toISOString(), opciones: null, autos: [...c.autos, now.toISOString()], ultimo: now.toISOString() });
    return { respuestas: [{ texto: `Recibimos tu solicitud para borrar tus datos. ${Asesor} la confirma contigo por este medio y te avisa cuando quede hecho (m\xE1ximo 15 d\xEDas h\xE1biles).` }], conv: c, lead, motivo: "borrar-datos" };
  }
  if (/\b(no|sin) (mas )?promociones\b|\bya no (me )?(manden|envien|mandes|envies) promociones\b/.test(limpio)) {
    lead.noPromociones = true;
    Object.assign(c, { autos: [...c.autos, now.toISOString()], ultimo: now.toISOString() });
    return { respuestas: [{ texto: "Listo, ya no te enviaremos promociones. Te seguimos contestando lo que nos preguntes \u{1F642}" }], conv: c, lead, motivo: "sin-promociones" };
  }
  if (c.paso === "asesor" && now - new Date(c.desde ?? 0) < v.horasConAsesor * HORA && !pideMenu) return quedar("con-asesor");
  if (!texto.trim()) return quedar("vacio");
  const resp = [];
  let motivo = "";
  let reserva = null;
  const decir = (txt, foto) => resp.push(foto ? { texto: txt, foto } : { texto: txt });
  const ir2 = (paso, opciones = null) => {
    c.paso = paso;
    c.desde = now.toISOString();
    c.opciones = opciones;
  };
  const calentar = (nivel) => {
    const orden = { frio: 0, tibio: 1, caliente: 2 };
    if ((orden[nivel] ?? 0) > (orden[c.calor] ?? -1)) {
      c.calor = nivel;
      lead.calor = nivel;
    }
  };
  const elegirAuto = (a2) => {
    c.autoId = a2.id;
    lead.autoId = a2.id;
    lead.interes = nombreAuto(a2);
    if (a2.precio > 0) lead.precio = a2.precio;
  };
  const desde = (a2) => {
    if (!(a2.precio > 0)) return "";
    const plazo = Math.max(...v.plazos);
    return mensualidad(a2.precio * (1 - v.engancheMinimo / 100), v.tasaAnual, plazo);
  };
  const saludo = () => {
    const intro = rellenar(v.presentacion?.trim() || "\xA1Hola {nombre}! \u{1F44B}", vars);
    return msg.enHorario === false ? `${intro} Ahorita estamos cerrados, pero te ayudo por aqu\xED.` : intro;
  };
  const menu = (encabezado = "\xBFEn qu\xE9 te ayudo?") => {
    if (!autos.length) {
      ir2("menu", ["cita", "asesor"]);
      return `${encabezado}
${enumerar(["Agendar cita para verlo o manejarlo", `Hablar con ${asesor}`])}

O dime qu\xE9 modelo te interesa (ej. \xABCR-V\xBB).`;
    }
    ir2("menu", OPCIONES_MENU);
    return `${encabezado}
${enumerar(["Ver autos disponibles", "Cotizar a cr\xE9dito", "Agendar prueba de manejo", `Hablar con ${asesor}`])}

Tambi\xE9n puedes escribir el auto que buscas (ej. \xAB${autos[0]?.modelo || "CR-V"}\xBB).`;
  };
  const lista = (cuales = autos, pendiente = null, encabezado = null) => {
    if (!cuales.length) return pasarAsesor(`Por ahora ${asesor} te comparte personalmente lo que tenemos disponible.`);
    const muestra = cuales.slice(0, MAX_LISTA);
    ir2("lista", muestra.map((a2) => `auto:${a2.id}`));
    c.pendiente = pendiente;
    calentar("tibio");
    const lineas = muestra.map((a2) => `*${nombreAuto(a2)}*${a2.precio > 0 ? ` \u2014 ${pesos(a2.precio)}` : ""}${a2.tipo === "seminuevo" && a2.km ? ` \xB7 ${FORMATO.format(a2.km)} km` : ""}`);
    const mas = cuales.length > MAX_LISTA ? `
\u2026y ${cuales.length - MAX_LISTA} m\xE1s: escribe el modelo que buscas.` : "";
    return `${encabezado ?? (pendiente === "credito" ? "\xBFPara qu\xE9 auto quieres la cotizaci\xF3n?" : "Estos son los autos disponibles:")}
${enumerar(lineas)}${mas}

Escribe el n\xFAmero para ver detalles${pendiente === "credito" ? " y tu cotizaci\xF3n" : " y fotos"}.`;
  };
  const ficha = (a2) => {
    elegirAuto(a2);
    calentar("tibio");
    ir2("auto", ["cotizar", "cita", "lista", "asesor"]);
    const detalles = [a2.tipo === "seminuevo" ? `Seminuevo${a2.km ? ` \xB7 ${FORMATO.format(a2.km)} km` : ""}` : a2.tipo === "nuevo" ? "Nuevo" : "", a2.transmision, a2.color].filter(Boolean).join(" \xB7 ");
    const m = desde(a2);
    const datos = [
      `\u{1F697} *${nombreAuto(a2)}*`,
      a2.precio > 0 ? `\u{1F4B5} *${pesos(a2.precio)}* de contado` : "\u{1F4B5} Precio: te lo confirma el asesor",
      detalles && `\u{1F539} ${detalles}`,
      a2.descripcion?.trim(),
      m && `\u{1F4B3} A cr\xE9dito desde ~${pesos(m)} al mes (${v.engancheMinimo}% de enganche, ${Math.max(...v.plazos)} meses)*`
    ].filter(Boolean);
    return `${datos.join("\n")}

\xBFQu\xE9 sigue?
${enumerar(["Cotizar a mi medida", "Agendar prueba de manejo", "Ver otros autos", `Hablar con ${asesor}`])}${m ? `

_*Estimado con tasa referencial de ${v.tasaAnual}% anual; sujeto a aprobaci\xF3n._` : ""}`;
  };
  const pedirEnganche = (a2) => {
    elegirAuto(a2);
    calentar("caliente");
    lead.formaPago = "credito";
    ir2("enganche");
    if (!(a2.precio > 0)) return pasarAsesor(`Para la *${nombreAuto(a2)}* ${asesor} te arma la cotizaci\xF3n con el precio vigente.`);
    return `Para cotizar la *${nombreAuto(a2)}* (${pesos(a2.precio)}) a cr\xE9dito: \xBFcu\xE1nto te gustar\xEDa dar de enganche? \u{1F4B0}
Puede ser en pesos o porcentaje (m\xEDnimo ${v.engancheMinimo}%), por ejemplo \xAB${v.engancheMinimo}%\xBB o \xAB${FORMATO.format(Math.round(a2.precio * v.engancheMinimo / 100 / 1e3))} mil\xBB.`;
  };
  const cotizar = (a2, enganche) => {
    elegirAuto(a2);
    calentar("caliente");
    lead.formaPago = "credito";
    const minimo = a2.precio * v.engancheMinimo / 100;
    if (enganche >= a2.precio) {
      lead.formaPago = "contado";
      ir2("cotizado", ["cita", "lista", "asesor"]);
      return `\xA1Con eso la pagas de contado! \u{1F389} La *${nombreAuto(a2)}* queda en *${pesos(a2.precio)}*.

${enumerar(["Agendar visita / prueba de manejo", "Ver otros autos", `Hablar con ${asesor}`])}`;
    }
    const ajustado = enganche < minimo;
    const eng = Math.max(enganche, minimo);
    lead.enganche = Math.round(eng);
    const filas = v.plazos.map((p) => `\u2022 ${p} meses: *${pesos(mensualidad(a2.precio - eng, v.tasaAnual, p))}*`);
    lead.plazo = Math.max(...v.plazos);
    lead.mensualidad = Math.round(mensualidad(a2.precio - eng, v.tasaAnual, lead.plazo));
    ir2("cotizado", ["cita", "lista", "asesor"]);
    return [
      ajustado ? `El enganche m\xEDnimo es de ${v.engancheMinimo}% (${pesos(minimo)}). Con eso te queda as\xED:` : `Con ${pesos(eng)} de enganche para la *${nombreAuto(a2)}*:`,
      filas.join("\n"),
      `_Estimado con tasa referencial de ${v.tasaAnual}% anual; no incluye seguro ni comisi\xF3n. Sujeto a aprobaci\xF3n._`,
      "",
      enumerar(["Agendar visita para tu cotizaci\xF3n formal", "Ver otros autos", `Hablar con ${asesor}`])
    ].join("\n");
  };
  const contado = (a2) => {
    lead.formaPago = "contado";
    calentar("tibio");
    if (!a2) return lista(autos, null, "\xA1Perfecto, de contado! \xBFQu\xE9 auto te interesa?");
    elegirAuto(a2);
    ir2("cotizado", ["cita", "lista", "asesor"]);
    return `\xA1Excelente! De contado la *${nombreAuto(a2)}* queda en *${a2.precio > 0 ? pesos(a2.precio) : "el precio que te confirma el asesor"}*. \xBFTe gustar\xEDa venir a verla?

${enumerar(["Agendar visita / prueba de manejo", "Ver otros autos", `Hablar con ${asesor}`])}`;
  };
  const pedirCita = (intro = "") => {
    calentar("caliente");
    const auto = porId(c.autoId);
    const que = auto ? `la ${nombreAuto(auto)}` : c.modelo ? `${femenino(c.modelo) ? "la" : "el"} ${c.modelo}` : "";
    const ops = tresOpciones(libres);
    if (ops.length) {
      ir2("cita", [...ops.map((x) => `slot:${x.id}`), "otra-hora"]);
      return `${intro ? `${intro} ` : ""}\xBFCu\xE1ndo puedes venir${que ? ` a ver ${que}` : ""}? Tengo:
${enumerar([...ops.map((x) => x.texto), "Otro d\xEDa u hora"])}`;
    }
    ir2("cita");
    return `${intro ? `${intro} ` : ""}\xBFQu\xE9 d\xEDa y a qu\xE9 hora puedes venir${que ? ` a ver ${que}` : ""}?${horario ? ` Abrimos ${horario}.` : ""}`;
  };
  const apartar = (id) => {
    const x = libres.find((l2) => l2.id === id);
    if (!x) return pedirCita();
    reserva = { id: x.id, texto: x.texto };
    Object.assign(lead, { cita: x.texto, citaId: x.id, citaConfirmada: true });
    calentar("caliente");
    ir2("nombre");
    return `Listo, qued\xF3 ${x.texto}. \xBFA nombre de qui\xE9n?`;
  };
  const anotarCita = (cuando) => {
    const a2 = porId(c.autoId);
    lead.cita = cuando.trim().slice(0, 120);
    lead.quiereAsesor = true;
    calentar("caliente");
    ir2("asesor");
    return `Va, queda anotado: ${lead.cita}${a2 ? ` para ver la ${nombreAuto(a2)}` : ""}. Ahorita te confirma ${asesor}.`;
  };
  function pasarAsesor(intro = "") {
    lead.quiereAsesor = true;
    calentar("caliente");
    ir2("asesor");
    return `${intro ? `${intro}
` : ""}${msg.enHorario === false ? `Va, le aviso ${aAsesor} para que te escriba en cuanto abramos${horario ? ` (${horario})` : ""}.` : `Va, ahorita le aviso ${aAsesor} para que te escriba.`}`;
  }
  const preguntarModelo = () => {
    ir2("menu", ["cita", "asesor"]);
    return "\xBFQu\xE9 modelo te interesa?";
  };
  const pedirCorrida = () => {
    calentar("tibio");
    ir2("corrida");
    return `Claro, te hago una corrida${c.modelo ? ` ${delModelo(c.modelo)}` : ""}. \xBFComo cu\xE1nto tienes pensado dar de enganche?`;
  };
  const conEnganche = (e) => {
    lead.formaPago = "credito";
    if (e?.monto) lead.enganche = e.monto;
    if (e?.pct) lead.enganchePct = e.pct;
    return pedirCita(e ? `Va, con ${e.texto} te armo la corrida.` : "Va, te la armo con 20, 30, 40 y 50% de enganche para que veas cu\xE1l te acomoda.");
  };
  const accion = (a2) => {
    if (a2.startsWith("slot:")) return apartar(a2.slice(5));
    if (a2 === "otra-hora") {
      ir2("cita");
      return "Sale, \xBFqu\xE9 d\xEDa y a qu\xE9 hora te acomoda? (por ejemplo \xABs\xE1bado 11 am\xBB)";
    }
    if (a2.startsWith("auto:")) {
      const auto = porId(a2.slice(5));
      if (!auto) return lista(autos, null, "Ese auto ya no est\xE1 disponible \u{1F615}. Estos s\xED:");
      const pendiente = c.pendiente;
      c.pendiente = null;
      return pendiente === "credito" ? pedirEnganche(auto) : { texto: ficha(auto), foto: auto.foto };
    }
    switch (a2) {
      case "lista":
        return lista();
      case "credito": {
        const auto = porId(c.autoId);
        return auto ? pedirEnganche(auto) : lista(autos, "credito");
      }
      case "cotizar": {
        const auto = porId(c.autoId);
        return auto ? pedirEnganche(auto) : lista(autos, "credito");
      }
      case "cita":
        return pedirCita();
      case "asesor":
        return pasarAsesor();
      default:
        return menu();
    }
  };
  try {
    const primero = Boolean(msg.primero) && !c.paso;
    const mencionados = buscarAutos(texto, autos);
    const n = numeroElegido(texto);
    const dice = Object.fromEntries(Object.entries(DICE).map(([k, ps2]) => [k, tieneAlguna(t, ps2)]));
    if (mencionados.length === 1) elegirAuto(mencionados[0]);
    const modelo = !mencionados.length ? modeloMencionado(texto) : null;
    if (modelo) {
      c.modelo = modelo;
      lead.interes = `${cfg.marca || "Honda"} ${modelo}`;
    }
    const eng = !autos.length ? engancheDicho(texto) : null;
    if (pideMenu) {
      motivo = "menu";
      decir(menu());
    } else if (c.paso === "nombre" && texto.trim().split(/\s+/).length <= 5 && !dice.asesor) {
      motivo = "nombre";
      lead.nombreCliente = texto.trim().replace(/^(soy|me llamo|a nombre de)\s+/i, "").slice(0, 60);
      lead.quiereAsesor = true;
      ir2("asesor");
      decir(`Gracias, ${primerNombre(lead.nombreCliente) || lead.nombreCliente}. Al llegar a la agencia pregunta por ${asesor} para que vaya a recibirte.`);
    } else if (c.paso === "corrida" && !dice.asesor && !dice.cita && !dice.contado && !(modelo && !eng) && (eng || tieneAlguna(t, NO_SABE) || c.fallos >= 1)) {
      motivo = "corrida";
      decir(conEnganche(eng));
    } else if (n !== null && c.opciones?.[n - 1] && c.paso !== "enganche") {
      motivo = c.opciones[n - 1].split(":")[0];
      const r = accion(c.opciones[n - 1]);
      if (typeof r === "string") decir(r);
      else decir(r.texto, r.foto || void 0);
    } else if ((c.paso === "enganche" || ["auto", "cotizado"].includes(c.paso) && montoExplicito(texto)) && !dice.asesor && porId(c.autoId)?.precio > 0 && leerEnganche(texto, porId(c.autoId).precio) !== null) {
      motivo = "cotizacion";
      decir(cotizar(porId(c.autoId), leerEnganche(texto, porId(c.autoId).precio)));
    } else if (c.paso === "cita" && !dice.asesor && (pareceFecha(texto) || c.fallos >= 1 && !dice.credito && !dice.contado && !dice.lista && !mencionados.length)) {
      motivo = "cita-anotada";
      decir(anotarCita(texto));
    } else if (dice.asesor) {
      motivo = "asesor";
      decir(pasarAsesor());
    } else if (dice.cita) {
      motivo = "cita";
      decir(pareceFecha(texto) ? anotarCita(texto) : pedirCita());
    } else if (dice.credito && autos.length) {
      motivo = "credito";
      const a2 = mencionados.length === 1 ? mencionados[0] : porId(c.autoId);
      if (a2?.precio > 0 && montoExplicito(texto) && leerEnganche(texto, a2.precio) !== null) {
        motivo = "cotizacion";
        decir(cotizar(a2, leerEnganche(texto, a2.precio)));
      } else decir(a2 ? pedirEnganche(a2) : lista(mencionados.length > 1 ? mencionados : autos, "credito"));
    } else if (dice.contado && autos.length) {
      motivo = "contado";
      decir(contado(mencionados.length === 1 ? mencionados[0] : porId(c.autoId)));
    } else if (mencionados.length === 1) {
      motivo = "auto";
      const a2 = mencionados[0];
      decir(ficha(a2), a2.foto || void 0);
    } else if (mencionados.length > 1) {
      motivo = "lista";
      decir(lista(mencionados, null, "Tengo estas opciones:"));
    } else {
      const regla = (cfg.reglas ?? []).find((r) => (r.palabras ?? []).some((p) => contienePalabra(texto, p)));
      if (regla) {
        motivo = "regla";
        decir(rellenar(regla.respuesta, vars));
      } else if ((dice.lista || dice.precio) && autos.length) {
        motivo = "lista";
        const semi = tieneAlguna(t, ["seminuevo", "seminuevos", "usado", "usados"]);
        const nuevos = !semi && tieneAlguna(t, ["nuevo", "nuevos", "0 km"]);
        const filtro = semi ? autos.filter((a2) => a2.tipo === "seminuevo") : nuevos ? autos.filter((a2) => a2.tipo === "nuevo") : autos;
        decir(lista(filtro.length ? filtro : autos, null, filtro.length && (semi || nuevos) ? `Estos son los ${semi ? "seminuevos" : "nuevos"} disponibles:` : null));
      } else if (dice.lista || dice.precio || dice.credito || dice.contado || modelo) {
        if (dice.contado) {
          motivo = "cita";
          lead.formaPago = "contado";
          decir(pedirCita("Va, de contado tambi\xE9n te armo la corrida."));
        } else if (eng) {
          motivo = "corrida";
          decir(conEnganche(eng));
        } else if (dice.precio || dice.credito || modelo) {
          motivo = "corrida";
          decir(pedirCorrida());
        } else {
          motivo = "menu";
          decir(preguntarModelo());
        }
      } else if (primero || dice.saludo) {
        motivo = "menu";
        decir(autos.length ? menu() : preguntarModelo());
      } else if (dice.gracias) {
        motivo = "gracias";
        decir("\xA1Con gusto! \u{1F60A} Si necesitas algo m\xE1s, escribe *men\xFA*.");
        c.opciones = OPCIONES_MENU;
        c.paso = "menu";
      } else if (c.paso === "enganche") {
        motivo = "no-entendi";
        c.fallos += 1;
        decir(c.fallos >= 2 ? pasarAsesor("No logr\xE9 entender el enganche \u{1F648}.") : "\xBFCu\xE1nto dar\xEDas de enganche? Escr\xEDbelo en pesos o porcentaje, por ejemplo \xAB20%\xBB o \xAB100 mil\xBB.");
      } else if (c.paso === "cita") {
        motivo = "no-entendi";
        c.fallos += 1;
        decir("\xBFQu\xE9 d\xEDa y a qu\xE9 hora te acomoda? Por ejemplo \xABs\xE1bado 11 am\xBB.");
      } else if (c.paso === "corrida") {
        motivo = "no-entendi";
        c.fallos += 1;
        decir("\xBFM\xE1s o menos cu\xE1nto podr\xEDas dar de enganche? Puede ser en pesos o porcentaje, por ejemplo \xAB80 mil\xBB o \xAB20%\xBB.");
      } else if (!autos.length) {
        motivo = "no-entendi";
        c.fallos += 1;
        decir(c.fallos >= 2 ? pasarAsesor() : "Perd\xF3n, no te entend\xED. \xBFQu\xE9 modelo te interesa?");
      } else {
        motivo = "no-entendi";
        c.fallos += 1;
        decir(c.fallos >= 2 ? pasarAsesor("Mejor te paso con una persona para ayudarte bien.") : `Perd\xF3n, no te entend\xED \u{1F648}. Escribe el *n\xFAmero* de una opci\xF3n o el *auto* que buscas.

${menu("Esto es lo que puedo hacer:")}`);
      }
    }
    if (motivo !== "no-entendi") c.fallos = 0;
    if (primero && resp.length) resp[0] = { ...resp[0], texto: `${saludo()}
${resp[0].texto}` };
  } catch {
    resp.length = 0;
    motivo = "asesor";
    decir(pasarAsesor());
  }
  if (resp.length) c.autos = [...c.autos, now.toISOString()];
  c.ultimo = now.toISOString();
  return { respuestas: resp, conv: c, lead, motivo, ...reserva ? { reserva } : {} };
}
function cifras(texto) {
  const salida = [];
  const re2 = /(\$\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)\s*(%|por\s*ciento|mil\b|k\b|millon(?:es)?\b|mdp\b)?/g;
  for (const m of sinAcentos(texto).matchAll(re2)) {
    const crudo = m[2];
    const conComas = /^\d{1,3}(,\d{3})+/.test(crudo);
    const n = Number(conComas ? crudo.replace(/,/g, "") : crudo.replace(",", "."));
    if (!Number.isFinite(n)) continue;
    const unidad = m[3] ?? "";
    if (/^(%|por)/.test(unidad)) salida.push(`${n}%`);
    else if (/^(millon|mdp)/.test(unidad)) salida.push(Math.round(n * 1e6));
    else if (/^(mil|k)/.test(unidad)) salida.push(Math.round(n * 1e3));
    else if (m[1] || conComas) salida.push(Math.round(n));
    else if (n >= 1e3 && !(Number.isInteger(n) && n >= 1990 && n <= 2040)) salida.push(Math.round(n));
  }
  return salida;
}
var ESQUEMA_IA = {
  type: "object",
  properties: {
    respuesta: { type: "string", description: "El mensaje de WhatsApp para el cliente" },
    pasar_a_asesor: { type: "boolean", description: "true cuando ya toca que el asesor lo atienda" },
    auto_id: { type: "string", description: "id del auto del inventario del que se habla, o vac\xEDo" },
    resumen: { type: "string", description: "Para el asesor: qui\xE9n es, qu\xE9 busca, c\xF3mo paga, qu\xE9 falta y qu\xE9 sigue (2-4 renglones)" },
    forma_pago: { type: "string", description: "contado, credito o vac\xEDo si no se sabe" },
    cita: { type: "string", description: "d\xEDa y hora que propuso el cliente para venir, o vac\xEDo" },
    reservar: { type: "string", description: "id EXACTO de la lista de horarios libres que el cliente ACEPT\xD3 en este mensaje, o vac\xEDo" },
    nombre: { type: "string", description: "nombre del cliente si ya lo dijo, o vac\xEDo" },
    modelo: { type: "string", description: "modelo que le interesa (ej. CR-V, Civic), o vac\xEDo" }
  },
  required: ["respuesta", "pasar_a_asesor", "auto_id", "resumen", "forma_pago", "cita", "reservar", "nombre", "modelo"],
  additionalProperties: false
};
function promptIA({ cfg = {}, inventario = [], historial = [], libres = [] }) {
  const nombre = cfg.asesor || "el asesor";
  const quien = cfg.asesor ? asesorCon(cfg.asesor) : "el asesor";
  const pila = primerNombre(nombre.replace(TITULO, "")) || nombre;
  const marca = cfg.marca || "Honda";
  const agencia = cfg.agencia || marca;
  const autos = disponibles(inventario).map((a2) => ({
    id: a2.id,
    auto: nombreAuto(a2),
    precio_contado: a2.precio > 0 ? pesos(a2.precio) : "lo confirma el asesor",
    tipo: a2.tipo,
    km: a2.km || void 0,
    color: a2.color || void 0,
    transmision: a2.transmision || void 0,
    descripcion: a2.descripcion || void 0
  }));
  const corridas = String(cfg.corridas ?? "").trim().slice(0, 12e3);
  const reglas = (cfg.reglas ?? []).map((r) => `- Si preguntan por ${(r.palabras ?? []).join(", ")}: ${r.respuesta}`).join("\n");
  const ejemplos = (cfg.estilo?.ejemplos ?? []).slice(0, 40);
  const opciones = libres.slice(0, 30);
  const system = [
    `Contestas el WhatsApp de ventas ${asesorCon(nombre, "de")}, asesor de ${marca}${agencia !== marca ? ` (${agencia})` : ""} en Monterrey. Escribes por \xE9l, como su equipo.`,
    `Tu meta: que el cliente venga a la agencia con cita. Ah\xED lo atiende ${quien} y cierra la venta.`,
    "",
    "C\xF3mo escribes:",
    "- Como una persona normal por WhatsApp: corto (1 o 2 renglones), sencillo y amable. Sin listas ni men\xFAs.",
    "- Nada de frases de vendedor ni de call center: \xABcon gusto te ayudo\xBB, \xABexcelente elecci\xF3n\xBB, \xABpromoci\xF3n del mes\xBB, \xABlo siento\xBB, \xABno puedo\xBB, \xAB\xBFen qu\xE9 m\xE1s te ayudo?\xBB.",
    "- Una pregunta a la vez. No repitas lo que ya dijiste. Si te saludan, saluda.",
    pila !== quien ? `- Si hablas de \xE9l di \xAB${quien}\xBB, nunca solo \xAB${pila}\xBB ni \xAB${pila} te dice\xBB.` : "",
    "- Horas como se dicen: \xABma\xF1ana a las 10\xBB, \xABhoy a las 4\xBB.",
    ejemplos.length ? `- As\xED escribe ${quien} en sus chats (copia su forma de escribir, no los datos):
${ejemplos.map((x) => `  \xB7 ${x.replace(/\s+/g, " ")}`).join("\n")}` : "",
    cfg.estilo?.notas ? `- Indicaciones ${asesorCon(nombre, "de")}: ${cfg.estilo.notas}` : "",
    "",
    "Qu\xE9 haces:",
    "- Si pide precio, informaci\xF3n o mensualidades: ofr\xE9cele una corrida y preg\xFAntale como cu\xE1nto tiene pensado dar de enganche. Si no sabe, dile que se la armas con 20, 30, 40 y 50%.",
    "- Si no sabes qu\xE9 modelo busca, preg\xFAntaselo.",
    corridas ? "- Ya con el enganche, si su modelo est\xE1 en CORRIDAS, dale el ejemplo m\xE1s cercano tal cual (enganche, plazo y mensualidad), dile que es aproximado y preg\xFAntale cu\xE1ndo puede venir a verlo." : "",
    `- ${corridas ? "Si su modelo no est\xE1 en CORRIDAS" : "A\xFAn no tienes las cifras"}: no des n\xFAmeros. Dile que se la armas y preg\xFAntale cu\xE1ndo puede venir a verla. Si la quiere por aqu\xED, dile que ahorita se la manda ${quien} (pasar_a_asesor = true).`,
    "- Para la cita ofrece DOS horarios de la lista de libres. Si pide otro, el m\xE1s cercano de la lista.",
    "- Si acepta un horario: pon su id exacto en \xABreservar\xBB, conf\xEDrmale d\xEDa y hora y preg\xFAntale a nombre de qui\xE9n.",
    `- Con cita y nombre cierra con: \xABAl llegar a la agencia pregunta por ${quien} para que vaya a recibirte.\xBB y pasar_a_asesor = true.`,
    "- Si duda (\xABluego paso\xBB, \xABsolo estoy viendo\xBB): sin presionar, dale una raz\xF3n para venir (verlo, manejarlo, su corrida).",
    "",
    "Nunca:",
    "- Inventes cifras (precios, mensualidades, tasas, descuentos, aval\xFAos, entregas). Solo las de CORRIDAS o las de los autos con precio.",
    `- Digas que eres una persona. Si te preguntan en serio si eres bot o IA, dilo: eres un asistente que le ayuda ${asesorCon(nombre, "a")} con sus mensajes, y si quiere, \xE9l le escribe directo.`,
    "",
    `pasar_a_asesor = true tambi\xE9n si pide negociar, descuento o hablar con ${quien}.`,
    `resumen (siempre, para ${quien}): nombre, modelo, contado o cr\xE9dito, enganche, auto a cuenta, cita y qu\xE9 sigue.`,
    "",
    "As\xED suena una pl\xE1tica (no copies los datos):",
    "Cliente: Hola precio del civic",
    "T\xFA: Hola! Claro, te hago una corrida del Civic. \xBFComo cu\xE1nto tienes pensado dar de enganche?",
    "Cliente: como 80 mil",
    "T\xFA: Va. \xBFCu\xE1ndo puedes venir a verlo? Tengo ma\xF1ana a las 10 o a las 4.",
    "Cliente: a las 4",
    "T\xFA: Listo, ma\xF1ana a las 4. \xBFA nombre de qui\xE9n?",
    "Cliente: Luis Trevi\xF1o",
    `T\xFA: Gracias Luis. Al llegar a la agencia pregunta por ${quien} para que vaya a recibirte.`,
    "",
    `Modelos ${marca} que la gente suele pedir: City (sed\xE1n y hatchback), Civic, Accord, HR-V, BR-V, CR-V, Pilot y Odyssey. Si piden otro, di que ${quien} te confirma si lo tienen.`,
    `Horario de la agencia: ${textoHorario(cfg.horario) || "el que confirme el asesor"}.`,
    opciones.length ? `Horarios LIBRES para cita (ofrece solo estos; id \u2192 texto):
${opciones.map((x) => `${x.id} \u2192 ${x.texto}`).join("\n")}` : `No hay horarios libres cargados: preg\xFAntale d\xEDa y hora y dile que ${quien} se lo confirma.`,
    corridas ? `CORRIDAS (las \xFAnicas cifras de cr\xE9dito que puedes dar; tal cual):
${corridas}` : "",
    reglas ? `Respuestas ${asesorCon(nombre, "de")} que debes respetar:
${reglas}` : "",
    autos.length ? `Autos con precio que S\xCD puedes mencionar (JSON):
${JSON.stringify(autos)}` : ""
  ].filter((x) => x !== "").join("\n");
  const turnos = historial.filter((m) => String(m.text ?? "").trim()).slice(-20).map((m) => ({ role: m.dir === "in" ? "user" : "assistant", content: String(m.text).slice(0, 1500) }));
  while (turnos.length && turnos[0].role !== "user") turnos.shift();
  return { system, messages: turnos };
}
function aplicarIA(r, salida, { inventario = [], antes = {}, ahora = /* @__PURE__ */ new Date(), libres = [], cfg = {}, historial = [] } = {}) {
  const texto = String(salida?.respuesta ?? "").trim().slice(0, 1200);
  if (!texto) return r;
  const permitidas = /* @__PURE__ */ new Set([
    ...cifras(cfg.corridas),
    ...(cfg.reglas ?? []).flatMap((x) => cifras(x?.respuesta)),
    ...historial.filter((m) => m.dir === "in").flatMap((m) => cifras(m.text)),
    ...disponibles(inventario).filter((a2) => a2.precio > 0).map((a2) => Math.round(a2.precio)),
    "20%",
    "30%",
    "40%",
    "50%",
    `${(cfg.ventas ?? VENTAS_BASE).engancheMinimo ?? VENTAS_BASE.engancheMinimo}%`
  ]);
  const inventada = cifras(texto).find((x) => !permitidas.has(x));
  if (inventada !== void 0) throw new Error(`dio una cifra que no est\xE1 en las corridas (${typeof inventada === "number" ? pesos(inventada) : inventada})`);
  const now = ahora instanceof Date ? ahora : new Date(ahora);
  const conv = { ...antes, autos: r.conv.autos, ultimo: r.conv.ultimo, fallos: 0 };
  const lead = {};
  const auto = salida.auto_id ? disponibles(inventario).find((a2) => a2.id === salida.auto_id) : null;
  if (auto) {
    conv.autoId = auto.id;
    lead.autoId = auto.id;
    lead.interes = nombreAuto(auto);
    if (auto.precio > 0) lead.precio = auto.precio;
  }
  if (salida.resumen?.trim()) lead.resumen = salida.resumen.trim().slice(0, 800);
  if (["contado", "credito"].includes(salida.forma_pago)) lead.formaPago = salida.forma_pago;
  if (salida.cita?.trim()) {
    lead.cita = salida.cita.trim().slice(0, 120);
    lead.calor = "caliente";
  }
  if (salida.nombre?.trim()) lead.nombreCliente = salida.nombre.trim().slice(0, 60);
  if (salida.modelo?.trim() && !lead.interes) lead.interes = `${salida.modelo.trim().slice(0, 60)}`;
  const libre = salida.reservar ? libres.find((x) => x.id === salida.reservar) : null;
  if (libre) Object.assign(lead, { cita: libre.texto, citaId: libre.id, citaConfirmada: true, calor: "caliente" });
  const foto = auto?.foto && !(antes.fotos ?? []).includes(auto.id) ? auto.foto : null;
  if (foto) conv.fotos = [...antes.fotos ?? [], auto.id];
  if (salida.pasar_a_asesor) {
    Object.assign(conv, { paso: "asesor", desde: now.toISOString(), opciones: null, calor: "caliente" });
    Object.assign(lead, { quiereAsesor: true, calor: "caliente" });
  } else if (!conv.paso || conv.paso === "asesor") {
    Object.assign(conv, { paso: "menu", opciones: ["lista", "credito", "cita", "asesor"] });
  }
  return { respuestas: [foto ? { texto, foto } : { texto }], conv, lead, motivo: "ia", ...libre ? { reserva: { id: libre.id, texto: libre.texto } } : {} };
}

// prueba/servidor/core.mjs
var VERSION = "conector-1.2";
var MAX_MSGS = 500;
var CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
var json = (body, status2 = 200) => new Response(JSON.stringify(body), { status: status2, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
var fail = (error, status2 = 400) => json({ ok: false, error }, status2);
var invalido = (msg) => Object.assign(new Error(msg), { status: 400 });
var borrar = (store, key) => store.delete ? store.delete(key) : store.put(key, null);
function ahoraDe(opciones) {
  const v = typeof opciones?.ahora === "function" ? opciones.ahora() : opciones?.ahora;
  return v ? new Date(v) : /* @__PURE__ */ new Date();
}
var enc = new TextEncoder();
function sameSecret(a2, b) {
  const x = enc.encode(String(a2 ?? ""));
  const y2 = enc.encode(String(b ?? ""));
  if (!y2.length || x.length !== y2.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y2[i];
  return d === 0;
}
async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
var DESDE_APP = {
  WA_TOKEN: /^\S{20,600}$/,
  WA_PHONE_NUMBER_ID: /^\d{1,25}$/,
  WA_WABA_ID: /^\d{1,25}$/,
  META_APP_SECRET: /^[a-f0-9]{16,64}$/i,
  META_VERIFY_TOKEN: /^[\w.-]{6,100}$/,
  FB_PAGE_ID: /^\d{1,25}$/,
  FB_PAGE_TOKEN: /^\S{20,600}$/,
  IG_USER_ID: /^\d{1,25}$/,
  ASESOR_WHATSAPP: /^\d{10,15}$/,
  ANTHROPIC_API_KEY: /^sk-ant-\S{10,300}$/,
  ANTHROPIC_MODEL: /^claude-[a-z0-9-]{2,60}$/,
  PUBLIC_URL: /^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/
};
var SECRETOS = /* @__PURE__ */ new Set(["WA_TOKEN", "META_APP_SECRET", "FB_PAGE_TOKEN", "ANTHROPIC_API_KEY"]);
async function conConexion(env, store) {
  const d = await store.get("conexion:meta") ?? {};
  const extra = Object.fromEntries(Object.keys(DESDE_APP).filter((k) => typeof d[k] === "string" && d[k]).map((k) => [k, d[k]]));
  return Object.keys(extra).length ? { ...env, ...extra } : env;
}
async function guardarConexion(env, store, datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) throw invalido("Faltan los datos");
  const actual = await store.get("conexion:meta") ?? {};
  for (const [k, v] of Object.entries(datos)) {
    if (!Object.hasOwn(DESDE_APP, k)) throw invalido(`Dato desconocido: ${k}`);
    const t = String(v ?? "").trim().replace(/\/+$/, "");
    if (!t) {
      delete actual[k];
      continue;
    }
    if (!DESDE_APP[k].test(t)) throw invalido(`${k} no tiene el formato esperado`);
    actual[k] = t;
  }
  if (!actual.META_VERIFY_TOKEN && !env.META_VERIFY_TOKEN) actual.META_VERIFY_TOKEN = `sofia-${nuevoId().slice(0, 16)}`;
  await store.put("conexion:meta", actual);
}
async function vistaConexion(env, store, base) {
  const d = await store.get("conexion:meta") ?? {};
  const efectivo = await conConexion(env, store);
  const configurado = Object.fromEntries(Object.keys(DESDE_APP).map((k) => [k, d[k] ? "app" : env[k] ? "servidor" : null]));
  const visibles = Object.fromEntries(Object.keys(DESDE_APP).filter((k) => !SECRETOS.has(k) && efectivo[k]).map((k) => [k, efectivo[k]]));
  return { configurado, valores: visibles, webhook: { url: `${publicBase(efectivo, base)}/webhook/meta`, verifyToken: efectivo.META_VERIFY_TOKEN ?? null } };
}
var graphUrl = (env) => (env.META_GRAPH_URL || "https://graph.facebook.com/v23.0").replace(/\/+$/, "");
var waReady = (env) => Boolean(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID);
var fbReady = (env) => Boolean(env.FB_PAGE_ID && env.FB_PAGE_TOKEN);
var igReady = (env) => Boolean(env.IG_USER_ID && env.FB_PAGE_TOKEN);
async function graph(env, path, { method = "GET", token, body, form } = {}) {
  const res = await fetch(`${graphUrl(env)}/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...body ? { "content-type": "application/json" } : {} },
    body: form ?? (body ? JSON.stringify(body) : void 0)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(e.error_user_msg || e.message || `Meta respondi\xF3 ${res.status}`);
  }
  return data;
}
var DIA_MS = 24 * 3600 * 1e3;
var marcasRecientes = (marcas, hasta) => Object.fromEntries(Object.entries(marcas ?? {}).filter(([, at2]) => new Date(hasta) - new Date(at2) < 30 * DIA_MS));
async function addMessage(store, channel, peer, name, msg, autoKey, extra) {
  const key = `${channel}:${peer}`;
  const list = await store.get(`inbox:c:${key}`) ?? [];
  if (msg.id && list.some((m) => m.id === msg.id)) return null;
  list.push(msg);
  if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS);
  await store.put(`inbox:c:${key}`, list);
  const index = await store.get("inbox:index") ?? {};
  const prev = index[key] ?? null;
  const base = prev ?? { channel, id: peer, count: 0 };
  index[key] = {
    ...base,
    name: name || base.name || "",
    lastAt: msg.at,
    lastText: msg.text || (msg.media ? `[${msg.type}]` : ""),
    lastDir: msg.dir,
    lastInAt: msg.dir === "in" ? msg.at : base.lastInAt ?? null,
    count: base.count + 1,
    ...msg.dir === "out" && !msg.auto ? { lastManualAt: msg.at } : {},
    ...autoKey ? { autoAt: marcasRecientes({ ...base.autoAt, [autoKey]: msg.at }, msg.at) } : {},
    ...extra ?? {}
  };
  await store.put("inbox:index", index);
  return { prev };
}
var ORDEN_ESTADO = { sent: 1, delivered: 2, read: 3 };
async function setStatus(store, channel, peer, id, status2) {
  const k = `inbox:c:${channel}:${peer}`;
  const list = await store.get(k);
  const m = list?.find((x) => x.id === id);
  if (!m || m.status === status2 || ORDEN_ESTADO[status2] < ORDEN_ESTADO[m.status]) return;
  m.status = status2;
  await store.put(k, list);
}
function waText(m) {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "image":
    case "video":
    case "document":
    case "audio":
    case "sticker":
      return m[m.type]?.caption ?? "";
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "location":
      return `\u{1F4CD} ${m.location?.latitude},${m.location?.longitude}`;
    case "reaction":
      return m.reaction?.emoji ?? "";
    default:
      return `[${m.type}]`;
  }
}
var PERFIL = 3;
var AGENTE_BASE = {
  perfil: PERFIL,
  activo: true,
  zonaHoraria: "America/Monterrey",
  horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" },
  // 0 = domingo, 1 = lunes … 6 = sábado
  bienvenida: "\xA1Hola {nombre}! Gracias por escribir. En un momento te atiendo.",
  fueraDeHorario: "\xA1Hola {nombre}! Gracias por tu mensaje. En este momento estoy fuera de horario; te contesto en cuanto regrese.",
  reglas: [],
  // [ { palabras: ["precio", "cuánto cuesta"], respuesta: "…" } ]
  esperaHoras: 12,
  // no repetir la misma respuesta automática al mismo contacto antes de N horas
  pausaMinutos: 30,
  // si el asesor contestó a mano hace menos de N minutos, el agente no interrumpe
  asesor: "Mario Abarca",
  agencia: "Honda",
  marca: "Honda",
  ventas: { ...VENTAS_BASE, ia: true },
  // vendedora (agenda citas); apagada = solo lo de arriba
  estilo: { ejemplos: [], notas: "" },
  // cómo escribe el asesor: con IA, Sofía habla como él
  corridas: ""
  // corridas del asesor (enganche 20/30/40/50 %), tal cual: con IA son las únicas cifras de crédito que da
};
var MAX_CORRIDAS = 12e3;
var MAX_REGLAS = 50;
var MAX_TEXTO_AUTO = 1e3;
var MIN_ESPERA_HORAS = 1;
var HORA2 = /^([01]\d|2[0-3]):[0-5]\d$/;
var SIN_RESPUESTA = /* @__PURE__ */ new Set(["reaction", "system", "unsupported", "errors", "ephemeral"]);
var DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function zonaValida(zona) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}
function textoAuto(v, campo) {
  const t = String(v ?? "").trim();
  if (t.length > MAX_TEXTO_AUTO) throw invalido(`${campo}: m\xE1ximo ${MAX_TEXTO_AUTO} caracteres`);
  return t;
}
function numeroEntre(v, porDefecto, min, max) {
  const n = Number(v ?? porDefecto);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.max(n, min), max) : porDefecto;
}
function normalizarConfig(c) {
  const h2 = { ...AGENTE_BASE.horario, ...c.horario ?? {} };
  if (!HORA2.test(h2.inicio) || !HORA2.test(h2.fin)) throw invalido("El horario va como HH:MM, por ejemplo 09:00 y 19:00");
  if (!Array.isArray(h2.dias)) throw invalido("Los d\xEDas del horario deben ser una lista");
  const numeros = h2.dias.map((d) => /^\s*[0-7]\s*$/.test(String(d)) ? Number(d) % 7 : NaN);
  if (numeros.some(Number.isNaN)) throw invalido("Los d\xEDas del horario van del 0 (domingo) al 6 (s\xE1bado)");
  const dias = [...new Set(numeros)].sort((a2, b) => a2 - b);
  const zonaHoraria = String(c.zonaHoraria || AGENTE_BASE.zonaHoraria);
  if (!zonaValida(zonaHoraria)) throw invalido(`Zona horaria desconocida: ${zonaHoraria}`);
  if (!Array.isArray(c.reglas)) throw invalido("Las reglas deben ser una lista");
  if (c.reglas.length > MAX_REGLAS) throw invalido(`M\xE1ximo ${MAX_REGLAS} reglas`);
  const reglas = c.reglas.map((r, i) => {
    const palabras = (Array.isArray(r?.palabras) ? r.palabras : String(r?.palabras ?? "").split(",")).map((p) => String(p).trim()).filter(Boolean);
    const respuesta = textoAuto(r?.respuesta, `Regla ${i + 1}`);
    if (!palabras.length || !respuesta) throw invalido(`La regla ${i + 1} necesita palabras y respuesta`);
    return { palabras, respuesta };
  });
  return {
    activo: Boolean(c.activo),
    zonaHoraria,
    horario: { dias, inicio: h2.inicio, fin: h2.fin },
    bienvenida: textoAuto(c.bienvenida, "Bienvenida"),
    fueraDeHorario: textoAuto(c.fueraDeHorario, "Fuera de horario"),
    reglas,
    esperaHoras: numeroEntre(c.esperaHoras, AGENTE_BASE.esperaHoras, MIN_ESPERA_HORAS, 720),
    pausaMinutos: numeroEntre(c.pausaMinutos, AGENTE_BASE.pausaMinutos, 0, 1440),
    asesor: String(c.asesor ?? "").trim().slice(0, 80),
    agencia: String(c.agencia ?? "").trim().slice(0, 80),
    marca: String(c.marca ?? AGENTE_BASE.marca).trim().slice(0, 40) || AGENTE_BASE.marca,
    ventas: normalizarVentas(c.ventas),
    estilo: normalizarEstilo(c.estilo),
    corridas: textoCorridas(c.corridas),
    perfil: PERFIL
  };
}
function textoCorridas(v) {
  const t = String(v ?? "").replace(/\r\n?/g, "\n").trim();
  if (t.length > MAX_CORRIDAS) throw invalido(`Corridas: m\xE1ximo ${MAX_CORRIDAS} caracteres`);
  return t;
}
function normalizarEstilo(e = {}) {
  const ejemplos = (Array.isArray(e?.ejemplos) ? e.ejemplos : []).map((x) => String(x ?? "").trim().slice(0, 300)).filter((x) => x.length >= 3).slice(0, 40);
  return { ejemplos, notas: String(e?.notas ?? "").trim().slice(0, 600) };
}
function normalizarVentas(v = {}) {
  const b = AGENTE_BASE.ventas;
  const entre = (x, porDefecto, min, max) => {
    const n = Number(x ?? porDefecto);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : porDefecto;
  };
  const plazos = Array.isArray(v.plazos) ? [...new Set(v.plazos.map(Number).filter((n) => Number.isInteger(n) && n >= 6 && n <= 96))].sort((x, y2) => x - y2).slice(0, 6) : b.plazos;
  return {
    activo: v.activo === void 0 ? b.activo : Boolean(v.activo),
    tasaAnual: Math.round(entre(v.tasaAnual, b.tasaAnual, 0, 80) * 100) / 100,
    engancheMinimo: entre(v.engancheMinimo, b.engancheMinimo, 0, 90),
    plazos: plazos.length ? plazos : b.plazos,
    horasConAsesor: entre(v.horasConAsesor, b.horasConAsesor, 0, 168),
    presentacion: textoAuto(v.presentacion, "Presentaci\xF3n"),
    ia: v.ia === void 0 ? b.ia : Boolean(v.ia)
  };
}
async function leerConfig(store) {
  let c = await store.get("agente:config");
  if (c && !c.marca) c = { ...c, activo: true, asesor: c.asesor || AGENTE_BASE.asesor, agencia: c.agencia || AGENTE_BASE.agencia, marca: AGENTE_BASE.marca, ventas: { ...c.ventas ?? {}, activo: true, ia: true } };
  if (c && (c.perfil ?? 1) < PERFIL) {
    c = { ...c, perfil: PERFIL, asesor: ["", "Mario", "Lic. Mario Abarca"].includes(c.asesor ?? "") ? AGENTE_BASE.asesor : c.asesor };
    if (/Soy Sofía/i.test(c.ventas?.presentacion ?? "")) c.ventas = { ...c.ventas, presentacion: "" };
  }
  return { ...AGENTE_BASE, ...c ?? {}, horario: { ...AGENTE_BASE.horario, ...c?.horario ?? {} }, ventas: { ...AGENTE_BASE.ventas, ...c?.ventas ?? {} } };
}
function enHorario(cfg, ahora) {
  let partes;
  try {
    partes = new Intl.DateTimeFormat("en-US", { timeZone: cfg.zonaHoraria, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ahora);
  } catch {
    return true;
  }
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  const { dias, inicio, fin } = cfg.horario;
  if (!dias.includes(DIAS[p.weekday])) return false;
  const hhmm = `${p.hour}:${p.minute}`;
  if (inicio === fin) return true;
  return inicio < fin ? hhmm >= inicio && hhmm < fin : hhmm >= inicio || hhmm < fin;
}
function huella(s) {
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) h2 = Math.imul(h2 ^ s.charCodeAt(i), 16777619);
  return (h2 >>> 0).toString(36);
}
function elegirRespuesta(cfg, e, ahora) {
  const candidatas = [];
  if (e.primero && cfg.bienvenida) candidatas.push(cfg.bienvenida);
  if (cfg.fueraDeHorario && !enHorario(cfg, ahora)) candidatas.push(cfg.fueraDeHorario);
  for (const r of cfg.reglas) if (r.palabras.some((p) => contienePalabra(e.texto, p))) candidatas.push(r.respuesta);
  const espera = Math.max(Number(cfg.esperaHoras) || 0, MIN_ESPERA_HORAS) * 3600 * 1e3;
  return candidatas.find((t) => {
    const antes = e.prev?.autoAt?.[huella(t)];
    return !antes || ahora - new Date(antes) >= espera;
  });
}
async function responderSolo(env, store, cfg, e, ahora) {
  if (!cfg.activo) return false;
  if (ahora - new Date(e.at) > DIA_MS) return false;
  const pausa = cfg.pausaMinutos * 60 * 1e3;
  if (pausa && e.prev?.lastManualAt && ahora - new Date(e.prev.lastManualAt) < pausa) return false;
  const plantilla = elegirRespuesta(cfg, e, ahora);
  if (!plantilla) return false;
  const text = rellenar(plantilla, { nombre: primerNombre(e.nombre), asesor: cfg.asesor, agencia: cfg.agencia || "la agencia" });
  if (!text) return false;
  try {
    await sendMessage(env, store, { channel: e.canal, to: e.id, text }, { ahora, autoKey: huella(plantilla) });
  } catch (err) {
    const errores = await store.get("agente:errores") ?? [];
    errores.unshift({ at: ahora.toISOString(), canal: e.canal, id: e.id, error: err.message ?? String(err) });
    await store.put("agente:errores", errores.slice(0, 20));
  }
  return true;
}
var MAX_AUTOS = 200;
var MAX_FOTO_AUTO = 5 * 1024 * 1024;
async function responderVentas(env, store, cfg, e, ahora, base) {
  if (!cfg.activo) return false;
  if (ahora - new Date(e.at) > DIA_MS) return false;
  const pausa = cfg.pausaMinutos * 60 * 1e3;
  if (pausa && e.prev?.lastManualAt && ahora - new Date(e.prev.lastManualAt) < pausa) return false;
  const inventario = await inventarioVendedora(store, publicBase(env, base), true);
  const historial = async () => (await store.get(`inbox:c:${e.canal}:${e.id}`) ?? []).map((m) => ({ dir: m.dir, text: m.text }));
  const libres = await libresDe(store, cfg, ahora);
  const r = await pensarVenta(env, cfg, inventario, e.prev?.venta ?? {}, { texto: e.texto, nombre: e.nombre, primero: e.primero }, historial, ahora, libres);
  if (r.errorIA) await anotarError(store, e, `IA: ${r.errorIA}`, ahora);
  if (Object.keys(r.lead).length) await actualizarLead(store, e, r.lead, ahora);
  if (r.reserva) await apartarCita(env, store, cfg, e, r, ahora);
  await avisarSiToca(env, store, cfg, e, r, ahora);
  for (const [i, m] of r.respuestas.entries()) {
    try {
      await sendMessage(
        env,
        store,
        { channel: e.canal, to: e.id, text: m.texto, ...m.foto ? { image: m.foto } : {} },
        { ahora, autoKey: `venta:${r.motivo}`, indice: i === r.respuestas.length - 1 ? { venta: r.conv } : void 0 }
      );
    } catch (err) {
      await anotarError(store, e, err.message ?? String(err), ahora);
      break;
    }
  }
  return r.respuestas.length > 0;
}
async function inventarioVendedora(store, pub, soloHttps) {
  const ok = !soloHttps || pub.startsWith("https://");
  return (await store.get("ventas:inventario") ?? []).map((a2) => ({ ...a2, foto: a2.fotoId && ok ? `${pub}/media/${a2.fotoId}` : null }));
}
async function citasActivas(store, ahora) {
  return (await store.get("agenda:citas") ?? []).filter((x) => x.estado !== "cancelada" && new Date(x.id) > ahora - 2 * 3600 * 1e3);
}
async function libresDe(store, cfg, ahora) {
  const ocupadas = (await citasActivas(store, ahora)).map((x) => x.id);
  return horariosLibres({ horario: cfg.horario, zonaHoraria: cfg.zonaHoraria, ocupadas, ahora });
}
async function apartarCita(env, store, cfg, e, r, ahora) {
  const citas = await store.get("agenda:citas") ?? [];
  if (citas.some((x) => x.id === r.reserva.id && x.estado !== "cancelada")) return false;
  const lead = (await store.get("leads:index") ?? {})[`${e.canal}:${e.id}`] ?? {};
  const cita = { id: r.reserva.id, texto: r.reserva.texto, canal: e.canal, cliente: e.id, nombre: lead.nombreCliente || e.nombre || "", interes: lead.interes ?? "", resumen: lead.resumen ?? "", creada: ahora.toISOString(), estado: "apartada" };
  for (const x of citas) if (x.canal === e.canal && x.cliente === e.id && x.estado === "apartada") x.estado = "cancelada";
  citas.push(cita);
  await store.put("agenda:citas", citas.filter((x) => new Date(x.id) > ahora - 30 * DIA_MS).slice(-500));
  return true;
}
async function avisarSiToca(env, store, cfg, e, r, ahora) {
  const citas = await store.get("agenda:citas") ?? [];
  const cita = citas.find((x) => x.canal === e.canal && x.cliente === e.id && x.estado === "apartada" && !x.avisada);
  const lead = (await store.get("leads:index") ?? {})[`${e.canal}:${e.id}`] ?? {};
  if (!cita) {
    if (!r.lead.quiereAsesor) return;
    const clave = `aviso:${e.canal}:${e.id}`;
    const antes = await store.get(clave);
    if (antes && ahora - new Date(antes) < 12 * 3600 * 1e3) return;
    await store.put(clave, ahora.toISOString());
    await avisarAsesor(env, store, cfg, e, null, ahora, lead);
    return;
  }
  if (!lead.nombreCliente && !r.lead.quiereAsesor) return;
  Object.assign(cita, { nombre: lead.nombreCliente || cita.nombre, interes: lead.interes || cita.interes, resumen: lead.resumen || cita.resumen, avisada: true });
  await store.put("agenda:citas", citas);
  await avisarAsesor(env, store, cfg, e, cita, ahora, lead);
}
async function avisarAsesor(env, store, cfg, e, cita, ahora, lead = {}) {
  const numero = String(env.ASESOR_WHATSAPP ?? "").replace(/\D/g, "");
  if (!numero || !waReady(env)) return;
  const nombre = cita?.nombre || lead.nombreCliente || e.nombre || "Cliente";
  const interes = cita?.interes || lead.interes;
  const resumen = cita?.resumen || lead.resumen;
  const pago = lead.formaPago === "contado" ? "De contado" : lead.formaPago === "credito" ? `Cr\xE9dito${lead.enganche ? ` \xB7 enganche ${pesos(lead.enganche)}` : lead.enganchePct ? ` \xB7 enganche ${lead.enganchePct}%` : ""}` : "";
  const renglones = [
    cita ? `\u{1F4C5} Cita nueva: ${nombre} \xB7 ${cita.texto}` : `\u{1F64B} ${nombre} quiere que lo atiendas`,
    interes && `Le interesa: ${interes}`,
    pago,
    resumen,
    e.canal === "wa" ? `WhatsApp: https://wa.me/${e.id}` : "Por Messenger"
  ];
  const texto = renglones.filter(Boolean).join("\n");
  try {
    await sendMessage(env, store, { channel: "wa", to: numero.length === 10 ? `52${numero}` : numero, text: texto }, { ahora });
  } catch (err) {
    await anotarError(store, e, `Aviso a ${cfg.asesor || "el asesor"}: ${err.message ?? err} (Meta solo deja escribirle si \xE9l le mand\xF3 un mensaje al n\xFAmero de Sof\xEDa en las \xFAltimas 24 h)`, ahora);
  }
}
var SIN_IA = /* @__PURE__ */ new Set(["freno", "con-asesor", "vacio", "borrar-datos", "sin-promociones"]);
async function pensarVenta(env, cfg, inventario, antes, msg, historial, ahora, libres = []) {
  const r = decidir({ cfg, inventario, conv: antes, msg: { ...msg, enHorario: enHorario(cfg, ahora) }, ahora, libres });
  if (SIN_IA.has(r.motivo) || !cfg.ventas.ia || !motorIA(env)) return r;
  try {
    const h2 = await historial();
    return aplicarIA(r, await preguntarIA(env, promptIA({ cfg, inventario, historial: h2, libres })), { inventario, antes, ahora, libres, cfg, historial: h2 });
  } catch (err) {
    return { ...r, errorIA: err.message ?? String(err) };
  }
}
async function anotarError(store, e, error, ahora) {
  const errores = await store.get("agente:errores") ?? [];
  errores.unshift({ at: ahora.toISOString(), canal: e.canal, id: e.id, error });
  await store.put("agente:errores", errores.slice(0, 20));
}
var MODELO_IA = "claude-opus-5-5";
var CON_RESPALDO = /* @__PURE__ */ new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1"]);
async function preguntarClaude(env, { system, messages }) {
  const sdk = await Promise.resolve().then(() => (init_anthropic_sdk(), anthropic_sdk_exports));
  const cliente = new sdk.default({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 15e3, ...env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {} });
  const model = env.ANTHROPIC_MODEL || MODELO_IA;
  const params = { model, max_tokens: 16e3, system, messages, output_config: { effort: "low", format: sdk.jsonSchemaOutputFormat(ESQUEMA_IA) } };
  if (CON_RESPALDO.has(model)) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  const res = await cliente.beta.messages.create(params);
  if (res.stop_reason === "refusal") throw new Error("Claude no quiso contestar ese mensaje");
  if (res.stop_reason === "max_tokens") throw new Error("respuesta incompleta");
  return JSON.parse(res.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}
var MODELO_GRATIS = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
function leerJson(texto) {
  const t = String(texto ?? "");
  try {
    return JSON.parse(t);
  } catch {
  }
  const a2 = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a2 < 0 || b <= a2) throw new Error("la IA no contest\xF3 en el formato esperado");
  return JSON.parse(t.slice(a2, b + 1));
}
async function preguntarCloudflare(env, { system, messages }) {
  const formato = `

Contesta SOLO con un objeto JSON con estas llaves: ${Object.entries(ESQUEMA_IA.properties).map(([k, v]) => `${k} (${v.description})`).join("; ")}.`;
  const llamada = env.AI.run(env.CF_AI_MODEL || MODELO_GRATIS, {
    messages: [{ role: "system", content: system + formato }, ...messages],
    response_format: { type: "json_schema", json_schema: ESQUEMA_IA },
    max_tokens: 800,
    temperature: 0.7
  });
  const res = await Promise.race([llamada, new Promise((_2, no2) => setTimeout(() => no2(new Error("la IA de Cloudflare tard\xF3 demasiado")), 2e4))]);
  const r = res?.response ?? res;
  return r && typeof r === "object" ? r : leerJson(r);
}
var motorIA = (env) => env.ANTHROPIC_API_KEY ? "claude" : typeof env.AI?.run === "function" ? "cloudflare" : null;
async function preguntarIA(env, prompt) {
  if (!prompt.messages.length) throw new Error("sin mensajes del cliente");
  const motor = motorIA(env);
  if (motor === "claude") return preguntarClaude(env, prompt);
  if (motor === "cloudflare") return preguntarCloudflare(env, prompt);
  throw new Error("no hay IA conectada en el servidor");
}
async function actualizarLead(store, e, cambios, ahora) {
  const leads = await store.get("leads:index") ?? {};
  const clave = `${e.canal}:${e.id}`;
  const l2 = Object.hasOwn(leads, clave) ? leads[clave] : { canal: e.canal, id: e.id, nombre: e.nombre || "", primerMensaje: String(e.texto ?? "").slice(0, 300), at: ahora.toISOString(), importado: false };
  Object.assign(l2, cambios, { actualizado: ahora.toISOString() });
  if (cambios.cita || cambios.quiereAsesor) {
    l2.importado = false;
    delete l2.importadoAt;
  }
  leads[clave] = l2;
  await store.put("leads:index", leads);
}
async function guardarInventario(store, autos) {
  if (!Array.isArray(autos)) throw invalido("Falta el inventario (autos)");
  if (autos.length > MAX_AUTOS) throw invalido(`M\xE1ximo ${MAX_AUTOS} autos`);
  const txt = (x, max = 80) => String(x ?? "").trim().slice(0, max);
  const num = (x) => {
    const n = Number(String(x ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const limpio = autos.map((a2) => {
    if (!a2 || typeof a2 !== "object") throw invalido("Auto inv\xE1lido");
    const id = txt(a2.id, 40);
    if (!/^[\w-]+$/.test(id)) throw invalido("Cada auto necesita un id");
    if (!txt(a2.modelo) && !txt(a2.marca)) throw invalido("Cada auto necesita marca o modelo");
    return {
      id,
      marca: txt(a2.marca),
      modelo: txt(a2.modelo),
      version: txt(a2.version),
      anio: num(a2.anio) || "",
      precio: num(a2.precio),
      tipo: a2.tipo === "seminuevo" ? "seminuevo" : "nuevo",
      km: num(a2.km),
      color: txt(a2.color),
      transmision: txt(a2.transmision),
      descripcion: txt(a2.descripcion, 400),
      palabras: (Array.isArray(a2.palabras) ? a2.palabras : String(a2.palabras ?? "").split(",")).map((x) => txt(x, 40)).filter(Boolean).slice(0, 10),
      disponible: a2.disponible !== false,
      ...MEDIA_ID.test(a2.fotoId ?? "") ? { fotoId: a2.fotoId } : {}
    };
  });
  const antes = await store.get("ventas:inventario") ?? [];
  const usadas = new Set(limpio.map((a2) => a2.fotoId).filter(Boolean));
  for (const a2 of antes) if (a2.fotoId && !usadas.has(a2.fotoId)) await borrar(store, `media:${a2.fotoId}`);
  await store.put("ventas:inventario", limpio);
  return limpio;
}
var vistaAuto = (a2, base) => ({ ...a2, foto: a2.fotoId ? `${base}/media/${a2.fotoId}` : null });
var MAX_LEADS = 1e3;
async function addLead(store, canal, id, nombre, msg) {
  const leads = await store.get("leads:index") ?? {};
  const clave = `${canal}:${id}`;
  if (leads[clave]) return;
  leads[clave] = { canal, id, nombre: nombre || "", primerMensaje: (msg.text || (msg.media ? `[${msg.type}]` : "")).slice(0, 300), at: msg.at, importado: false };
  const claves = Object.keys(leads);
  if (claves.length > MAX_LEADS) {
    const orden = claves.sort((a2, b) => Number(leads[b].importado) - Number(leads[a2].importado) || leads[a2].at.localeCompare(leads[b].at));
    for (const k of orden.slice(0, claves.length - MAX_LEADS)) delete leads[k];
  }
  await store.put("leads:index", leads);
}
async function nombreMessenger(env, store, psid) {
  if (!fbReady(env)) return "";
  const prev = (await store.get("inbox:index") ?? {})[`fb:${psid}`];
  if (prev) return prev.name ?? "";
  try {
    const p = await graph(env, `${encodeURIComponent(psid)}?fields=first_name,last_name`, { token: env.FB_PAGE_TOKEN });
    return [p.first_name, p.last_name].filter(Boolean).join(" ");
  } catch {
    return "";
  }
}
function fechaMeta(ms2, ahora) {
  const d = new Date(ms2);
  return Number.isNaN(d.getTime()) ? ahora.toISOString() : d.toISOString();
}
var AVISO_MS = 10 * 60 * 1e3;
async function handleWebhook(req, env, store, ahora) {
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!env.META_APP_SECRET) return fail("Falta META_APP_SECRET en el servidor", 500);
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  if (!sameSecret(sig, await hmacHex(env.META_APP_SECRET, raw))) return fail("Firma inv\xE1lida", 401);
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return fail("JSON inv\xE1lido");
  }
  const ultimo = await store.get("webhook:last");
  if (!ultimo || ultimo.object !== body.object || !(ahora - new Date(ultimo.at) < AVISO_MS)) await store.put("webhook:last", { at: ahora.toISOString(), object: body.object });
  const cfg = await leerConfig(store);
  const contestados = /* @__PURE__ */ new Set();
  const recibido = async (canal, peer, nombre, msg, { contestable, propio = false }) => {
    const r = await addMessage(store, canal, peer, nombre, msg);
    if (!r || propio) return;
    if (!r.prev) await addLead(store, canal, peer, nombre, msg);
    const clave = `${canal}:${peer}`;
    if (!contestable || contestados.has(clave)) return;
    try {
      const e = { canal, id: peer, nombre, texto: msg.text, at: msg.at, primero: !r.prev, prev: r.prev };
      if (await (cfg.ventas.activo ? responderVentas(env, store, cfg, e, ahora, baseDe(req)) : responderSolo(env, store, cfg, e, ahora))) contestados.add(clave);
    } catch (e) {
      console.error("Agente de Sof\xEDa:", e);
    }
  };
  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const names = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? ""]));
      const propio = String(v.metadata?.display_phone_number ?? "").replace(/\D/g, "");
      for (const m of v.messages ?? []) {
        const media = ["image", "video", "document", "audio", "sticker"].includes(m.type) ? { id: m[m.type]?.id, mime: m[m.type]?.mime_type, filename: m[m.type]?.filename ?? "" } : void 0;
        await recibido(
          "wa",
          m.from,
          names[m.from],
          { id: m.id, dir: "in", type: m.type, text: waText(m), at: fechaMeta(Number(m.timestamp) * 1e3, ahora), ...media ? { media } : {} },
          { contestable: !SIN_RESPUESTA.has(m.type) && !m.errors, propio: Boolean(propio) && m.from === propio }
        );
      }
      for (const st2 of v.statuses ?? []) await setStatus(store, "wa", st2.recipient_id, st2.id, st2.status);
    }
  } else if (body.object === "page") {
    for (const entry of body.entry ?? []) for (const ev of entry.messaging ?? []) {
      const message = ev.message ?? (ev.postback ? { mid: ev.postback.mid ?? `pb.${ev.sender?.id}.${ev.timestamp}`, text: ev.postback.title ?? "" } : null);
      if (!message || message.is_echo) continue;
      const psid = ev.sender?.id;
      if (!psid || psid === env.FB_PAGE_ID) continue;
      const att = message.attachments?.[0];
      await recibido("fb", psid, await nombreMessenger(env, store, psid), {
        id: message.mid,
        dir: "in",
        type: att ? att.type : "text",
        text: message.text ?? "",
        at: fechaMeta(ev.timestamp, ahora),
        ...att?.payload?.url ? { media: { url: att.payload.url, mime: att.type === "image" ? "image/jpeg" : "" } } : {}
      }, { contestable: true });
    }
  }
  return json({ ok: true });
}
async function sendMessage(env, store, b, { ahora = /* @__PURE__ */ new Date(), autoKey, indice } = {}) {
  const at2 = ahora.toISOString();
  const auto = autoKey ? { auto: true } : {};
  if (b.channel === "fb") {
    if (!fbReady(env)) throw new Error("Facebook no est\xE1 configurado en el servidor");
    const enviar = (message) => graph(env, `${env.FB_PAGE_ID}/messages`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { recipient: { id: b.to }, messaging_type: "RESPONSE", message } });
    if (b.image) {
      const ri2 = await enviar({ attachment: { type: "image", payload: { url: b.image, is_reusable: true } } });
      await addMessage(store, "fb", b.to, "", { id: ri2.message_id, dir: "out", type: "image", text: "", at: at2, status: "sent", media: { url: b.image }, ...auto }, autoKey);
    }
    const r2 = await enviar({ text: b.text });
    await addMessage(store, "fb", b.to, "", { id: r2.message_id, dir: "out", type: "text", text: b.text, at: at2, status: "sent", ...auto }, autoKey, indice);
    return { id: r2.message_id };
  }
  if (!waReady(env)) throw new Error("WhatsApp no est\xE1 configurado en el servidor");
  const to2 = String(b.to ?? "").replace(/\D/g, "");
  if (!to2) throw new Error("Falta el n\xFAmero");
  let payload;
  let text = b.text ?? "";
  if (b.template) {
    const params = (b.template.params ?? []).map((t) => ({ type: "text", text: String(t) }));
    payload = { type: "template", template: { name: b.template.name, language: { code: b.template.lang || "es_MX" }, ...params.length ? { components: [{ type: "body", parameters: params }] } : {} } };
    text = b.template.preview || `[Plantilla ${b.template.name}]`;
  } else if (b.image && text.length <= MAX_PIE_WA) {
    payload = { type: "image", image: { link: b.image, ...text ? { caption: text } : {} } };
  } else {
    if (!text.trim()) throw new Error("Mensaje vac\xEDo");
    payload = { type: "text", text: { body: text, preview_url: true } };
  }
  const r = await graph(env, `${env.WA_PHONE_NUMBER_ID}/messages`, { method: "POST", token: env.WA_TOKEN, body: { messaging_product: "whatsapp", to: to2, ...payload } });
  const id = r.messages?.[0]?.id;
  const peer = String(r.contacts?.[0]?.wa_id ?? "").replace(/\D/g, "") || to2;
  await addMessage(store, "wa", peer, "", { id, dir: "out", type: payload.type, text, at: at2, status: "sent", ...payload.image ? { media: { url: b.image } } : {}, ...auto }, autoKey, indice);
  return { id };
}
var MAX_PIE_WA = 1024;
function deBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl ?? "");
  return m ? new Blob([deBase64(m[2])], { type: m[1] }) : null;
}
async function publishPost(env, store, b) {
  if (!fbReady(env)) throw new Error("Facebook no est\xE1 configurado en el servidor");
  if (!b.message?.trim() && !b.image) throw new Error("La publicaci\xF3n est\xE1 vac\xEDa");
  let r;
  const img = b.image ? dataUrlToBlob(b.image) : null;
  if (img) {
    const form = new FormData();
    form.append("caption", b.message ?? "");
    form.append("source", img, "foto.jpg");
    r = await graph(env, `${env.FB_PAGE_ID}/photos`, { method: "POST", token: env.FB_PAGE_TOKEN, form });
  } else {
    r = await graph(env, `${env.FB_PAGE_ID}/feed`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { message: b.message, ...b.link ? { link: b.link } : {} } });
  }
  const postId = r.post_id ?? r.id;
  const posts = await store.get("fb:posts") ?? [];
  posts.unshift({ id: postId, at: (/* @__PURE__ */ new Date()).toISOString(), message: (b.message ?? "").slice(0, 300), photo: Boolean(img) });
  await store.put("fb:posts", posts.slice(0, 200));
  return { id: postId, url: `https://www.facebook.com/${postId}` };
}
async function publishInstagram(env, { caption, imageUrl }) {
  if (!igReady(env)) throw new Error("Instagram no est\xE1 configurado en el servidor (falta IG_USER_ID)");
  const contenedor = await graph(env, `${env.IG_USER_ID}/media`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { image_url: imageUrl, caption } });
  const r = await graph(env, `${env.IG_USER_ID}/media_publish`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { creation_id: contenedor.id } });
  let url;
  try {
    url = (await graph(env, `${r.id}?fields=permalink`, { token: env.FB_PAGE_TOKEN })).permalink;
  } catch {
  }
  return { id: r.id, ...url ? { url } : {} };
}
var CANALES = ["facebook", "instagram"];
var FOTOS = ["image/jpeg", "image/png", "image/gif"];
var MAX_INTENTOS = 3;
var MAX_COLA = 100;
var MAX_FOTO = 8 * 1024 * 1024;
var MAX_CAPTION_IG = 2200;
var REINTENTO_MS = 5 * 60 * 1e3;
var BLOQUEO_MS = 15 * 60 * 1e3;
var nuevoId = () => crypto.randomUUID().replace(/-/g, "");
var hecho = (id, canal) => `social:hecho:${id}:${canal}`;
var MEDIA_ID = /^[a-f0-9]{32}$/;
var MEDIA_SEGURA = /^(image\/(jpeg|png|gif|webp)|application\/pdf|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp))$/;
function baseDe(req) {
  const u = new URL(req.url);
  const proto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  return `${proto ? `${proto}:` : u.protocol}//${u.host}`;
}
var publicBase = (env, base) => String(env.PUBLIC_URL || base || "").replace(/\/+$/, "");
async function programar(env, store, p, base, ahora) {
  if (!p || typeof p !== "object") throw invalido("Falta la publicaci\xF3n");
  const canales = [...new Set(Array.isArray(p.canales) ? p.canales : [])];
  if (!canales.length || canales.some((c) => !CANALES.includes(c))) throw invalido("Elige Facebook, Instagram o ambos");
  const texto = String(p.texto ?? "").trim();
  const cuando = new Date(p.cuando ?? ahora);
  if (Number.isNaN(cuando.getTime())) throw invalido("Fecha y hora inv\xE1lidas");
  let foto = null;
  if (p.imagen) {
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(p.imagen));
    if (!m || !FOTOS.includes(m[1])) throw invalido("La foto debe ser JPG, PNG o GIF");
    foto = { mime: m[1], datos: m[2].replace(/\s+/g, "") };
    if (foto.datos.length * 0.75 > MAX_FOTO) throw invalido("La foto pesa m\xE1s de 8 MB");
  }
  if (!texto && !foto) throw invalido("La publicaci\xF3n est\xE1 vac\xEDa");
  if (canales.includes("facebook") && !fbReady(env)) throw invalido("Facebook no est\xE1 configurado en el servidor");
  if (canales.includes("instagram")) {
    if (!igReady(env)) throw invalido("Instagram no est\xE1 configurado en el servidor (falta IG_USER_ID)");
    if (!foto) throw invalido("Instagram solo publica con foto");
    if (foto.mime !== "image/jpeg") throw invalido("Instagram solo acepta fotos JPG");
    if (texto.length > MAX_CAPTION_IG) throw invalido(`Instagram acepta m\xE1ximo ${MAX_CAPTION_IG} caracteres`);
    if (!publicBase(env, base).startsWith("https://")) throw invalido("Instagram descarga la foto de una direcci\xF3n p\xFAblica HTTPS: define PUBLIC_URL en el servidor (o usa el t\xFAnel/Cloudflare)");
  }
  const cola = await store.get("social:cola") ?? [];
  const terminadas = cola.filter((x) => x.estado === "publicado" || x.estado === "error");
  if (cola.length - terminadas.length >= MAX_COLA) throw invalido(`Ya hay ${MAX_COLA} publicaciones en espera`);
  const item = { id: nuevoId(), texto, cuando: cuando.toISOString(), canales, base, creado: ahora.toISOString(), estado: "pendiente", intentos: 0, resultados: {} };
  if (foto) {
    item.mediaId = nuevoId();
    item.mime = foto.mime;
    await store.put(`media:${item.mediaId}`, foto);
  }
  cola.push(item);
  const sobran = terminadas.sort((a2, b) => a2.cuando.localeCompare(b.cuando)).slice(0, Math.max(0, cola.length - MAX_COLA));
  for (const x of sobran) {
    if (x.mediaId) await borrar(store, `media:${x.mediaId}`);
    for (const c of x.canales) if (x.resultados?.[c]?.ok) await borrar(store, hecho(x.id, c));
  }
  await store.put("social:cola", cola.filter((x) => !sobran.includes(x)));
  return item;
}
function vistaCola(env, x, base) {
  const v = { ...x, imagen: x.mediaId ? `${publicBase(env, base || x.base)}/media/${x.mediaId}` : null };
  delete v.base;
  delete v.bloqueo;
  return v;
}
async function publicarProgramada(env, store, x, base, ahora) {
  const foto = x.mediaId ? await store.get(`media:${x.mediaId}`) : null;
  for (const canal of x.canales) {
    if (x.resultados[canal]?.ok) continue;
    const previo = await store.get(hecho(x.id, canal));
    if (previo?.ok) {
      x.resultados[canal] = previo;
      continue;
    }
    let r;
    try {
      if (x.mediaId && !foto) throw new Error("La foto ya no est\xE1 en el servidor");
      if (canal === "facebook") {
        r = await publishPost(env, store, { message: x.texto, ...foto ? { image: `data:${foto.mime};base64,${foto.datos}` } : {} });
      } else {
        if (!foto) throw new Error("Instagram solo publica con foto");
        if (!base) throw new Error("Falta PUBLIC_URL: Instagram necesita una direcci\xF3n p\xFAblica para descargar la foto");
        r = await publishInstagram(env, { caption: x.texto, imageUrl: `${base}/media/${x.mediaId}` });
      }
    } catch (e) {
      x.resultados[canal] = { ok: false, error: e.message ?? String(e), at: ahora.toISOString() };
      continue;
    }
    x.resultados[canal] = { ok: true, id: r.id, ...r.url ? { url: r.url } : {}, at: ahora.toISOString() };
    await store.put(hecho(x.id, canal), x.resultados[canal]);
  }
  delete x.bloqueo;
  if (x.canales.every((c) => x.resultados[c]?.ok)) {
    x.estado = "publicado";
    delete x.siguiente;
  } else if (x.intentos >= MAX_INTENTOS) {
    x.estado = "error";
  } else {
    x.estado = "pendiente";
    x.siguiente = new Date(ahora.getTime() + x.intentos * REINTENTO_MS).toISOString();
  }
}
async function runScheduled(envBase, store, ahoraISO = (/* @__PURE__ */ new Date()).toISOString(), baseUrl = "", soloId = null) {
  const env = await conConexion(envBase, store);
  const ahora = new Date(ahoraISO);
  const cola = await store.get("social:cola") ?? [];
  const vencidas = cola.filter((x) => (!soloId || x.id === soloId) && (x.estado === "pendiente" && new Date(x.siguiente ?? x.cuando) <= ahora || x.estado === "publicando" && ahora - new Date(x.bloqueo) > BLOQUEO_MS));
  if (!vencidas.length) return { revisadas: cola.length, publicadas: 0, fallidas: 0 };
  const intentar = [];
  for (const x of vencidas) {
    if ((x.intentos ?? 0) >= MAX_INTENTOS) {
      x.estado = "error";
      delete x.bloqueo;
      continue;
    }
    Object.assign(x, { estado: "publicando", bloqueo: ahora.toISOString(), intentos: (x.intentos ?? 0) + 1 });
    intentar.push(x);
  }
  await store.put("social:cola", cola);
  for (const x of intentar) await publicarProgramada(env, store, x, publicBase(env, baseUrl || x.base), ahora);
  const porId = new Map(vencidas.map((x) => [x.id, x]));
  const actual = await store.get("social:cola") ?? [];
  await store.put("social:cola", actual.map((x) => porId.get(x.id) ?? x));
  return { revisadas: cola.length, publicadas: vencidas.filter((x) => x.estado === "publicado").length, fallidas: vencidas.filter((x) => x.estado !== "publicado").length };
}
async function status(env, store, ahora) {
  const out = { ok: true, version: VERSION, whatsapp: { configured: waReady(env) }, facebook: { configured: fbReady(env) }, instagram: { configured: igReady(env) }, webhook: { secret: Boolean(env.META_APP_SECRET), verifyToken: Boolean(env.META_VERIFY_TOKEN), last: await store.get("webhook:last") }, publicUrl: env.PUBLIC_URL || null };
  const cfg = await leerConfig(store);
  const errores = await store.get("agente:errores") ?? [];
  const inventario = await store.get("ventas:inventario") ?? [];
  out.agente = { activo: cfg.activo, enHorario: enHorario(cfg, ahora), reglas: cfg.reglas.length, ultimoError: errores[0] ?? null, ventas: { activo: cfg.ventas.activo, autos: inventario.filter((a2) => a2.disponible !== false).length, ia: { activa: Boolean(cfg.ventas.ia), motor: motorIA(env), llave: Boolean(motorIA(env)), modelo: motorIA(env) === "claude" ? env.ANTHROPIC_MODEL || MODELO_IA : motorIA(env) === "cloudflare" ? env.CF_AI_MODEL || MODELO_GRATIS : null } } };
  const nuevos = Object.values(await store.get("leads:index") ?? {}).filter((l2) => !l2.importado);
  out.prospectos = { nuevos: nuevos.length, calientes: nuevos.filter((l2) => l2.cita || l2.quiereAsesor).length };
  const cola = await store.get("social:cola") ?? [];
  out.programadas = { pendientes: cola.filter((x) => x.estado === "pendiente" || x.estado === "publicando").length, conError: cola.filter((x) => x.estado === "error").length };
  if (waReady(env)) {
    try {
      const p = await graph(env, `${env.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`, { token: env.WA_TOKEN });
      Object.assign(out.whatsapp, { ok: true, phone: p.display_phone_number, name: p.verified_name, quality: p.quality_rating });
    } catch (e) {
      Object.assign(out.whatsapp, { ok: false, error: e.message });
    }
  }
  if (fbReady(env)) {
    try {
      const p = await graph(env, `${env.FB_PAGE_ID}?fields=name,link`, { token: env.FB_PAGE_TOKEN });
      Object.assign(out.facebook, { ok: true, name: p.name, link: p.link });
    } catch (e) {
      Object.assign(out.facebook, { ok: false, error: e.message });
    }
  }
  if (igReady(env)) {
    try {
      const p = await graph(env, `${env.IG_USER_ID}?fields=username`, { token: env.FB_PAGE_TOKEN });
      Object.assign(out.instagram, { ok: true, username: p.username });
    } catch (e) {
      Object.assign(out.instagram, { ok: false, error: e.message });
    }
  }
  return out;
}
async function handle(req, envBase, store, opciones = {}) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const env = path === "/webhook/meta" || path.startsWith("/api/") && path !== "/api/salud" ? await conConexion(envBase, store) : envBase;
  const ahora = ahoraDe(opciones);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (path === "/webhook/meta") {
    if (req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && env.META_VERIFY_TOKEN && sameSecret(url.searchParams.get("hub.verify_token"), env.META_VERIFY_TOKEN);
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("Token de verificaci\xF3n incorrecto", { status: 403 });
    }
    if (req.method === "POST") return handleWebhook(req, env, store, ahora);
    return fail("M\xE9todo no permitido", 405);
  }
  if (path.startsWith("/media/")) {
    if (req.method !== "GET" && req.method !== "HEAD") return fail("M\xE9todo no permitido", 405);
    const id = path.slice("/media/".length);
    const foto = MEDIA_ID.test(id) ? await store.get(`media:${id}`) : null;
    if (!foto?.datos || !FOTOS.includes(foto.mime)) return new Response("No encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
    return new Response(deBase64(foto.datos), { headers: { "content-type": foto.mime, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff", ...CORS } });
  }
  if (path === "/api/salud") return json({ ok: true, version: VERSION });
  if (!path.startsWith("/api/")) return null;
  let body = {};
  if (req.method === "POST") {
    try {
      body = JSON.parse(await req.text());
    } catch {
      return fail("JSON inv\xE1lido");
    }
  }
  const token = req.method === "GET" ? url.searchParams.get("token") : body.token;
  if (!env.SOFIA_TOKEN) return fail("El servidor no tiene SOFIA_TOKEN configurado", 500);
  if (!sameSecret(token, env.SOFIA_TOKEN)) return fail("Clave incorrecta", 401);
  try {
    switch (`${req.method} ${path}`) {
      case "GET /api/estado":
        return json(await status(env, store, ahora));
      case "GET /api/datos": {
        const doc = await store.get("datos:main");
        if (!doc) return json({ ok: true, updatedAt: null, backup: null });
        return json(url.searchParams.get("meta") ? { ok: true, updatedAt: doc.updatedAt } : { ok: true, ...doc });
      }
      case "POST /api/datos": {
        if (body.backup?.app !== "sofia-prueba") return fail("No es un respaldo de Sof\xEDa");
        const prev = await store.get("datos:main");
        if (prev) await store.put("datos:prev", prev);
        const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await store.put("datos:main", { updatedAt, backup: body.backup });
        return json({ ok: true, updatedAt });
      }
      case "GET /api/buzon":
        return json({ ok: true, conversations: await store.get("inbox:index") ?? {} });
      case "GET /api/buzon/conversacion": {
        const key = url.searchParams.get("c") ?? "";
        if (!/^(wa|fb):[\w.-]+$/.test(key)) return fail("Conversaci\xF3n inv\xE1lida");
        return json({ ok: true, messages: await store.get(`inbox:c:${key}`) ?? [] });
      }
      case "POST /api/enviar":
        return json({ ok: true, ...await sendMessage(env, store, body, { ahora }) });
      case "GET /api/wa/plantillas": {
        if (!env.WA_WABA_ID || !env.WA_TOKEN) return fail("Falta WA_WABA_ID para leer plantillas");
        const r = await graph(env, `${env.WA_WABA_ID}/message_templates?fields=name,language,status,category,components&limit=100`, { token: env.WA_TOKEN });
        return json({ ok: true, templates: (r.data ?? []).filter((t) => t.status === "APPROVED") });
      }
      case "GET /api/media": {
        const id = url.searchParams.get("id") ?? "";
        if (!/^\d+$/.test(id) || !waReady(env)) return fail("Archivo inv\xE1lido");
        const meta = await graph(env, id, { token: env.WA_TOKEN });
        const file = await fetch(meta.url, { headers: { authorization: `Bearer ${env.WA_TOKEN}` } });
        if (!file.ok) return fail("No se pudo descargar el archivo de WhatsApp", 502);
        const tipo = String(meta.mime_type ?? "").split(";")[0].trim().toLowerCase();
        return new Response(file.body, { headers: { "content-type": MEDIA_SEGURA.test(tipo) ? tipo : "application/octet-stream", "content-disposition": "attachment", "x-content-type-options": "nosniff", "cache-control": "no-store", ...CORS } });
      }
      case "POST /api/facebook/publicar":
        return json({ ok: true, ...await publishPost(env, store, body) });
      case "GET /api/facebook/publicaciones":
        return json({ ok: true, posts: await store.get("fb:posts") ?? [] });
      // Agente sin IA
      case "GET /api/agente/config":
        return json({ ok: true, config: await leerConfig(store) });
      case "POST /api/agente/config": {
        if (!body.config || typeof body.config !== "object") return fail("Falta la configuraci\xF3n");
        const prev = await leerConfig(store);
        const config = normalizarConfig({ ...prev, ...body.config, horario: { ...prev.horario, ...body.config.horario ?? {} }, ventas: { ...prev.ventas, ...body.config.ventas ?? {} } });
        await store.put("agente:config", config);
        return json({ ok: true, config });
      }
      // Datos de Meta y de la IA desde la app (Más → Conexiones)
      case "GET /api/conexion":
        return json({ ok: true, ...await vistaConexion(envBase, store, baseDe(req)) });
      case "POST /api/conexion": {
        await guardarConexion(envBase, store, body.datos);
        return json({ ok: true, ...await vistaConexion(envBase, store, baseDe(req)) });
      }
      // Inventario de la vendedora (lo administra la app)
      case "GET /api/inventario": {
        const base = publicBase(env, baseDe(req));
        return json({ ok: true, autos: (await store.get("ventas:inventario") ?? []).map((a2) => vistaAuto(a2, base)) });
      }
      case "POST /api/inventario": {
        const base = publicBase(env, baseDe(req));
        return json({ ok: true, autos: (await guardarInventario(store, body.autos)).map((a2) => vistaAuto(a2, base)) });
      }
      case "POST /api/inventario/foto": {
        const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(body.imagen ?? ""));
        if (!m || !["image/jpeg", "image/png"].includes(m[1])) return fail("La foto debe ser JPG o PNG");
        const datos = m[2].replace(/\s+/g, "");
        if (datos.length * 0.75 > MAX_FOTO_AUTO) return fail("La foto pesa m\xE1s de 5 MB (WhatsApp no la acepta)");
        const fotoId = nuevoId();
        await store.put(`media:${fotoId}`, { mime: m[1], datos });
        return json({ ok: true, fotoId, foto: `${publicBase(env, baseDe(req))}/media/${fotoId}` });
      }
      // Citas que agendó Sofía (la app las muestra en Hoy)
      case "GET /api/agenda":
        return json({ ok: true, citas: (await citasActivas(store, ahora)).sort((a2, b) => a2.id.localeCompare(b.id)) });
      case "POST /api/agenda/cancelar": {
        const citas = await store.get("agenda:citas") ?? [];
        const x = citas.find((c) => c.id === body.id && c.cliente === body.cliente && c.estado === "apartada");
        if (!x) return fail("Esa cita ya no est\xE1", 404);
        x.estado = "cancelada";
        await store.put("agenda:citas", citas);
        return json({ ok: true });
      }
      // "Probar a Sofía" desde la app: el mismo camino que un mensaje real (menú + IA del servidor), sin guardar ni enviar nada.
      case "POST /api/vendedora/probar": {
        const cfg = await leerConfig(store);
        const inventario = await inventarioVendedora(store, publicBase(env, baseDe(req)), false);
        const historial = (Array.isArray(body.historial) ? body.historial : []).slice(-30).map((m) => ({ dir: m?.dir === "out" ? "out" : "in", text: String(m?.text ?? "").slice(0, 1500) }));
        const conv = body.conv && typeof body.conv === "object" && !Array.isArray(body.conv) ? body.conv : {};
        const r = await pensarVenta(env, cfg, inventario, conv, { texto: String(body.texto ?? "").slice(0, 1500), nombre: String(body.nombre ?? "").slice(0, 60), primero: Boolean(body.primero) }, async () => historial, ahora, await libresDe(store, cfg, ahora));
        return json({ ok: true, ...r });
      }
      // Prospectos (contactos nuevos que escribieron por WhatsApp o Messenger)
      case "GET /api/prospectos": {
        const leads = await store.get("leads:index") ?? {};
        const prospectos = Object.entries(leads).map(([clave, l2]) => ({ clave, ...l2 })).sort((a2, b) => b.at.localeCompare(a2.at));
        return json({ ok: true, prospectos });
      }
      case "POST /api/prospectos/marcar": {
        if (!Array.isArray(body.ids)) return fail("Faltan los prospectos a marcar (ids)");
        const leads = await store.get("leads:index") ?? {};
        const importado = body.importado !== false;
        let marcados = 0;
        for (const clave of body.ids) {
          const l2 = typeof clave === "string" && Object.hasOwn(leads, clave) ? leads[clave] : null;
          if (!l2 || l2.importado === importado) continue;
          l2.importado = importado;
          if (importado) l2.importadoAt = ahora.toISOString();
          else delete l2.importadoAt;
          marcados++;
        }
        if (marcados) await store.put("leads:index", leads);
        return json({ ok: true, marcados });
      }
      // Programador de publicaciones
      case "POST /api/social/programar": {
        const base = baseDe(req);
        const item = await programar(env, store, body.post, base, ahora);
        if (new Date(item.cuando) <= ahora) await runScheduled(env, store, ahora.toISOString(), base, item.id);
        const final = (await store.get("social:cola") ?? []).find((x) => x.id === item.id) ?? item;
        return json({ ok: true, item: vistaCola(env, final, base) });
      }
      case "GET /api/social/cola": {
        const base = baseDe(req);
        const cola = (await store.get("social:cola") ?? []).map((x) => vistaCola(env, x, base)).sort((a2, b) => a2.cuando.localeCompare(b.cuando));
        return json({ ok: true, cola });
      }
      case "POST /api/social/cancelar": {
        const cola = await store.get("social:cola") ?? [];
        const item = cola.find((x) => x.id === body.id);
        if (!item) return fail("Esa publicaci\xF3n ya no est\xE1 en la cola", 404);
        if (item.estado === "publicando") return fail("Se est\xE1 publicando en este momento; intenta en un minuto", 409);
        await store.put("social:cola", cola.filter((x) => x !== item));
        if (item.mediaId) await borrar(store, `media:${item.mediaId}`);
        return json({ ok: true });
      }
      default:
        return fail("Ruta no encontrada", 404);
    }
  } catch (e) {
    return fail(e.message ?? String(e), e.status ?? 502);
  }
}

// prueba/servidor/cloudflare/worker.mjs
var kvStore = (kv) => ({
  async get(key) {
    return kv.get(key, "json");
  },
  async put(key, value) {
    await kv.put(key, JSON.stringify(value));
  },
  async delete(key) {
    await kv.delete(key);
  }
});
var worker = {
  async fetch(request, env) {
    if (!env.SOFIA_KV) return new Response(JSON.stringify({ ok: false, error: "Falta vincular el KV 'SOFIA_KV' al Worker" }), { status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    const res = await handle(request, env, kvStore(env.SOFIA_KV));
    return res ?? new Response(`Conector de Sof\xEDa (${VERSION}) funcionando.`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
  // Publica en Facebook/Instagram lo programado que ya venció, aunque nadie abra la app.
  async scheduled(event, env, ctx) {
    if (!env.SOFIA_KV) return;
    const ahora = new Date(event?.scheduledTime ?? Date.now()).toISOString();
    ctx.waitUntil(runScheduled(env, kvStore(env.SOFIA_KV), ahora));
  }
};
var worker_default = worker;
export {
  worker_default as default
};
