"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api, fmtMoney, type Serialized } from "@/lib/api";
import type { ModelsOverview } from "@/server/desk/models";
import { Chip, ErrorNote, MediaThumb } from "./ui";

type O = Serialized<ModelsOverview>;
type Vehicle = O["vehicles"][number];
type Media = Vehicle["media"][number];

const KINDS: Array<[string, string]> = [
  ["", "Detectar (foto/video/PDF)"],
  ["photo", "Foto"],
  ["video", "Video"],
  ["flyer", "Flyer / promoción"],
  ["sheet", "Ficha técnica"],
];
const KIND_LABEL: Record<string, string> = { photo: "Foto", video: "Video", flyer: "Flyer", sheet: "Ficha" };
const UPDATE_KINDS: Array<[string, string]> = [
  ["novedad", "Novedad"],
  ["promo", "Promoción"],
  ["inventario", "Inventario"],
  ["argumento", "Argumento de venta"],
  ["ficha", "Dato técnico"],
];
const UNIT_STATUS: Array<[string, string]> = [
  ["available", "Disponible"],
  ["in_transit", "En tránsito"],
  ["reserved", "Apartada"],
  ["sold", "Vendida"],
];

export function ModelsApp({ initial }: { initial: O }) {
  const [data, setData] = useState(initial);
  const [sel, setSel] = useState<string>(initial.vehicles[0]?.id ?? "general");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = async () => setData(await api<O>("/api/desk/models"));
  async function post(body: Record<string, unknown>) {
    setError(null);
    try {
      await api("/api/desk/models", { body });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const vehicle = data.vehicles.find((v) => v.id === sel) ?? null;
  const media = vehicle ? vehicle.media : data.general.media;
  const updates = vehicle ? vehicle.updates : data.general.updates;

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {data.vehicles.map((v) => (
          <button key={v.id} type="button" onClick={() => setSel(v.id)} className={`min-h-10 shrink-0 rounded-full px-4 text-[14px] ${sel === v.id ? "bg-sand font-semibold text-ink" : "bg-panel text-ivory"}`}>
            {v.model}
            {v.media.length > 0 && <span className="ml-1 text-[11px] opacity-60">{v.media.length}</span>}
          </button>
        ))}
        <button type="button" onClick={() => setSel("general")} className={`min-h-10 shrink-0 rounded-full px-4 text-[14px] ${sel === "general" ? "bg-sand font-semibold text-ink" : "bg-panel text-dim"}`}>
          General / agencia
        </button>
        <button type="button" onClick={() => setAdding(true)} className="min-h-10 shrink-0 rounded-full bg-raise px-4 text-[14px] text-dim">
          + Modelo
        </button>
      </div>
      <ErrorNote error={error} />
      {adding && <AddVehicle onDone={async (ok) => (setAdding(false), ok && (await reload()))} onError={setError} />}

      {vehicle && (
        <section className="rounded-3xl bg-panel p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[20px] font-semibold text-ivory">
              {vehicle.model} <span className="text-[14px] font-normal text-faint">{vehicle.year}</span>
            </h2>
            <Link href="/rules" className="text-[12px] text-dim underline-offset-2 hover:underline">
              Precios y bonos →
            </Link>
          </div>
          {vehicle.versions.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {vehicle.versions.map((v) => (
                <li key={v.id}>
                  <Chip>
                    {v.name}
                    {v.price ? ` · ${fmtMoney(v.price)}${v.priceIsDemo ? " (DEMO)" : ""}` : ""}
                  </Chip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-faint">Sin versiones registradas. Agrégalas en Reglas comerciales.</p>
          )}
        </section>
      )}

      <MediaSection key={`m-${sel}`} vehicleId={vehicle?.id ?? null} media={media} versions={vehicle?.versions.map((v) => v.name) ?? []} onChange={reload} onError={setError} />
      <UpdatesSection key={`u-${sel}`} vehicleId={vehicle?.id ?? null} updates={updates} onPost={post} />
      {vehicle && <UnitsSection key={`n-${sel}`} vehicle={vehicle} onPost={post} />}
    </div>
  );
}

function AddVehicle({ onDone, onError }: { onDone: (ok: boolean) => void; onError: (e: string) => void }) {
  const [model, setModel] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [aliases, setAliases] = useState("");
  return (
    <form
      className="grid gap-2 rounded-3xl bg-panel p-4 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/api/desk/models", { body: { action: "add_vehicle", model, year: Number(year), aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean) } });
          onDone(true);
        } catch (err) {
          onError((err as Error).message);
        }
      }}
    >
      <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Modelo (ej. ZR-V)" className="rounded-xl bg-raise px-3 py-3 text-[16px] text-ivory placeholder:text-faint sm:col-span-1" />
      <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" placeholder="Año" className="rounded-xl bg-raise px-3 py-3 text-[16px] text-ivory" />
      <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Cómo lo escriben (zrv, zr v)" className="rounded-xl bg-raise px-3 py-3 text-[16px] text-ivory placeholder:text-faint" />
      <div className="flex gap-2">
        <button type="submit" className="flex-1 rounded-xl bg-sand px-4 text-[14px] font-semibold text-ink">
          Agregar
        </button>
        <button type="button" onClick={() => onDone(false)} className="rounded-xl bg-raise px-3 text-[14px] text-dim">
          ×
        </button>
      </div>
    </form>
  );
}

function MediaSection({ vehicleId, media, versions, onChange, onError }: { vehicleId: string | null; media: Media[]; versions: string[]; onChange: () => Promise<void>; onError: (e: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("");
  const [caption, setCaption] = useState("");
  const [versionName, setVersionName] = useState("");
  const [validTo, setValidTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files?.length) return onError("Elige fotos, videos o PDF.");
    const form = new FormData();
    for (const f of Array.from(files)) form.append("file", f);
    if (vehicleId) form.append("vehicleId", vehicleId);
    if (kind) form.append("kind", kind);
    if (caption.trim()) form.append("caption", caption.trim());
    if (versionName) form.append("versionName", versionName);
    if (validTo) form.append("validTo", validTo);
    setBusy(true);
    try {
      const res = await fetch("/api/desk/media", { method: "POST", body: form, credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
      if (fileRef.current) fileRef.current.value = "";
      setCaption("");
      setCount(0);
      await onChange();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/desk/media/${id}`, { method: "PATCH", body });
      await onChange();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <section className="rounded-3xl bg-panel p-4">
      <h3 className="text-[16px] font-semibold text-ivory">Fotos, videos y flyers</h3>
      <p className="mt-0.5 text-[13px] text-dim">Sofía los manda cuando el cliente pregunta por el modelo, cuando le recomienda otra opción o cuando tú se lo pides.</p>
      <form onSubmit={upload} className="mt-3 space-y-2 rounded-2xl bg-raise/60 p-3">
        <input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf" onChange={(e) => setCount(e.target.files?.length ?? 0)} className="block w-full text-[14px] text-dim file:mr-3 file:rounded-xl file:border-0 file:bg-sand file:px-4 file:py-2.5 file:text-[14px] file:font-semibold file:text-ink" />
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl bg-raise px-3 py-2.5 text-[16px] text-ivory">
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {versions.length > 0 && (
            <select value={versionName} onChange={(e) => setVersionName(e.target.value)} className="rounded-xl bg-raise px-3 py-2.5 text-[16px] text-ivory">
              <option value="">Todas las versiones</option>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-[13px] text-dim">
            Vigente hasta
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-raise px-3 py-2 text-[16px] text-ivory" />
          </label>
        </div>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} maxLength={1000} placeholder="Texto para mandar con este archivo (opcional; si lo dejas vacío, Sofía lo redacta)" className="w-full rounded-xl bg-raise px-3 py-2.5 text-[15px] text-ivory placeholder:text-faint" />
        <button type="submit" disabled={busy || !count} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sand text-[15px] font-semibold text-ink disabled:opacity-50">
          {busy ? "Subiendo…" : count ? `Subir ${count} archivo${count === 1 ? "" : "s"}` : "Elige archivos para subir"}
        </button>
        <p className="text-[11px] text-faint">Máximo 50 MB por archivo. Videos: MP4 o MOV.</p>
      </form>
      {media.length === 0 ? (
        <p className="mt-3 text-center text-[13px] text-faint">Todavía no hay material de este modelo.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((m) => (
            <li key={m.id} className={`rounded-2xl bg-raise p-2 ${m.sendOnAsk ? "" : "opacity-70"}`}>
              <MediaThumb m={m} size="lg" />
              <div className="mt-2 flex items-center gap-1">
                <Chip>{KIND_LABEL[m.kind] ?? m.kind}</Chip>
                {m.versionName && <Chip>{m.versionName}</Chip>}
              </div>
              <input
                defaultValue={m.title}
                onBlur={(e) => e.target.value.trim() && e.target.value !== m.title && patch(m.id, { title: e.target.value })}
                className="mt-1 w-full rounded-lg bg-transparent px-1 py-1 text-[13px] text-ivory focus:bg-panel"
              />
              <textarea
                defaultValue={m.caption ?? ""}
                onBlur={(e) => e.target.value !== (m.caption ?? "") && patch(m.id, { caption: e.target.value || null })}
                rows={2}
                placeholder="Texto al mandarlo"
                className="w-full rounded-lg bg-transparent px-1 py-1 text-[12px] text-dim placeholder:text-faint focus:bg-panel"
              />
              <label className="mt-1 flex items-center gap-2 text-[12px] text-dim">
                <input type="checkbox" checked={m.sendOnAsk} onChange={(e) => patch(m.id, { sendOnAsk: e.target.checked })} className="h-4 w-4 accent-[#e7d3ae]" />
                Mandar cuando pregunten
              </label>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`¿Borrar “${m.title}”?`)) return;
                  try {
                    await api(`/api/desk/media/${m.id}`, { method: "DELETE" });
                    await onChange();
                  } catch (err) {
                    onError((err as Error).message);
                  }
                }}
                className="mt-1 text-[12px] text-rose-300"
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UpdatesSection({ vehicleId, updates, onPost }: { vehicleId: string | null; updates: Vehicle["updates"]; onPost: (b: Record<string, unknown>) => Promise<void> }) {
  const [kind, setKind] = useState("novedad");
  const [text, setText] = useState("");
  const [validTo, setValidTo] = useState("");
  return (
    <section className="rounded-3xl bg-panel p-4">
      <h3 className="text-[16px] font-semibold text-ivory">Lo que Sofía debe saber</h3>
      <p className="mt-0.5 text-[13px] text-dim">Novedades, promociones, llegada de unidades o argumentos. Sofía lo menciona una vez a cada cliente que pregunte por {vehicleId ? "este modelo" : "la agencia"} y lo usa en tus indicaciones.</p>
      <form
        className="mt-3 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await onPost({ action: "add_update", vehicleId, kind, text, validTo: validTo || null });
          setText("");
          setValidTo("");
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={600} placeholder="Ej.: Este mes hay bono de $25,000 en la versión Touring" className="w-full rounded-xl bg-raise px-3 py-2.5 text-[15px] text-ivory placeholder:text-faint" />
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl bg-raise px-3 py-2.5 text-[16px] text-ivory">
            {UPDATE_KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[13px] text-dim">
            Hasta
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className="rounded-xl bg-raise px-3 py-2 text-[16px] text-ivory" />
          </label>
          <button type="submit" className="ml-auto rounded-xl bg-sand px-4 py-2.5 text-[14px] font-semibold text-ink">
            Guardar
          </button>
        </div>
      </form>
      <ul className="mt-3 space-y-2">
        {updates.map((u) => (
          <li key={u.id} className={`rounded-2xl bg-raise px-3 py-2.5 ${u.active ? "" : "opacity-50"}`}>
            <div className="flex items-center gap-2 text-[11px] text-faint">
              <span className="text-sand">{UPDATE_KINDS.find(([k]) => k === u.kind)?.[1] ?? u.kind}</span>
              {u.validTo && <span>hasta {new Date(u.validTo).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</span>}
              {!u.active && <span>· inactiva</span>}
              <span className="ml-auto flex gap-3">
                <button type="button" onClick={() => onPost({ action: "set_update", id: u.id, active: !u.active })} className="text-dim hover:text-ivory">
                  {u.active ? "Pausar" : "Activar"}
                </button>
                <button type="button" onClick={() => confirm("¿Borrar esta información?") && onPost({ action: "delete_update", id: u.id })} className="text-rose-300">
                  Borrar
                </button>
              </span>
            </div>
            <p className="mt-1 text-[14px] text-ivory">{u.text}</p>
          </li>
        ))}
        {updates.length === 0 && <li className="text-center text-[13px] text-faint">Nada registrado todavía.</li>}
      </ul>
    </section>
  );
}

function UnitsSection({ vehicle, onPost }: { vehicle: Vehicle; onPost: (b: Record<string, unknown>) => Promise<void> }) {
  const [versionName, setVersionName] = useState(vehicle.versions[0]?.name ?? "");
  const [color, setColor] = useState("");
  const [status, setStatus] = useState("available");
  const [notes, setNotes] = useState("");
  return (
    <section className="rounded-3xl bg-panel p-4">
      <h3 className="text-[16px] font-semibold text-ivory">Unidades</h3>
      <p className="mt-0.5 text-[13px] text-dim">Lo que tienes en piso o en camino. Te sirve para tus indicaciones (“dile a Juan que llegó su unidad”).</p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await onPost({ action: "add_unit", vehicleId: vehicle.id, versionName: versionName || null, color: color || null, status, notes: notes || null, modelYear: vehicle.year });
          setColor("");
          setNotes("");
        }}
      >
        <select value={versionName} onChange={(e) => setVersionName(e.target.value)} className="rounded-xl bg-raise px-3 py-2.5 text-[16px] text-ivory">
          <option value="">Versión</option>
          {vehicle.versions.map((v) => (
            <option key={v.id} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
        <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Color" className="rounded-xl bg-raise px-3 py-2.5 text-[16px] text-ivory placeholder:text-faint" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl bg-raise px-3 py-2.5 text-[16px] text-ivory">
          {UNIT_STATUS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-sand px-4 py-2.5 text-[14px] font-semibold text-ink">
          Agregar unidad
        </button>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (VIN, llega el viernes…)" className="rounded-xl bg-raise px-3 py-2.5 text-[16px] text-ivory placeholder:text-faint sm:col-span-4" />
      </form>
      <ul className="mt-3 divide-y divide-line">
        {vehicle.units.map((u) => (
          <li key={u.id} className="flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] text-ivory">{[u.versionName, u.color, u.modelYear].filter(Boolean).join(" · ") || "Unidad"}</div>
              {u.notes && <div className="truncate text-[12px] text-faint">{u.notes}</div>}
            </div>
            <select value={u.status} onChange={(e) => onPost({ action: "update_unit", id: u.id, status: e.target.value })} className="rounded-lg bg-raise px-2 py-1.5 text-[14px] text-ivory">
              {UNIT_STATUS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => confirm("¿Borrar unidad?") && onPost({ action: "delete_unit", id: u.id })} className="px-2 text-[16px] text-faint hover:text-rose-300">
              ×
            </button>
          </li>
        ))}
        {vehicle.units.length === 0 && <li className="py-2 text-center text-[13px] text-faint">Sin unidades registradas.</li>}
      </ul>
    </section>
  );
}
