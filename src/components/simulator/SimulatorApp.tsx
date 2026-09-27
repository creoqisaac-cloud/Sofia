"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CRM_STAGE_LABELS, TEMPERATURE_LABELS, type CrmStage, type Temperature } from "@/domain/enums";
import { api, fmtDate, type Serialized } from "@/lib/api";
import type { CustomerState } from "@/server/services/customers";
import { Badge, Button, TEMPERATURE_TONE } from "../ui";
import { ChatPanel } from "./ChatPanel";
import { InsightPanel } from "./InsightPanel";

export type State = Serialized<CustomerState>;

interface CustomerRow {
  id: string;
  displayName: string;
  conversationId: string;
  controlMode: "sofia" | "mario";
  lastMessageAt: string | null;
  stage: CrmStage | null;
  temperature: Temperature | null;
  openAlerts: number;
}

const LAST_KEY = "sofia:lastCustomer";

export function SimulatorApp() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<string | null>(params.get("c"));
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ sender: "customer" | "mario"; body: string } | null>(null);

  const loadCustomers = useCallback(async () => {
    const data = await api<{ customers: CustomerRow[] }>("/api/customers");
    setCustomers(data.customers);
    return data.customers;
  }, []);

  const loadState = useCallback(async (id: string) => {
    const data = await api<State>(`/api/customers/${id}`);
    setState(data);
  }, []);

  // Carga inicial: el prospecto de la URL, o el último abierto (continuar donde se quedó).
  useEffect(() => {
    let cancelled = false;
    api<{ customers: CustomerRow[] }>("/api/customers")
      .then(({ customers: list }) => {
        if (cancelled) return;
        setCustomers(list);
        if (selected) return;
        let last: string | null = null;
        try {
          last = window.localStorage.getItem(LAST_KEY);
        } catch {
          last = null;
        }
        const fallback = list.find((c) => c.id === last)?.id ?? list[0]?.id ?? null;
        if (fallback) select(fallback);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api<State>(`/api/customers/${selected}`)
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const current = state && state.customer.id === selected ? state : null;

  function select(id: string) {
    setSelected(id);
    try {
      window.localStorage.setItem(LAST_KEY, id);
    } catch {
      // almacenamiento no disponible: la URL basta
    }
    router.replace(`${pathname}?c=${id}`);
  }

  async function createProspect(displayName: string, phone: string) {
    setError(null);
    try {
      const res = await api<{ customerId: string }>("/api/customers", { body: { displayName, phone: phone || null } });
      await loadCustomers();
      select(res.customerId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function send(sender: "customer" | "mario", body: string) {
    const state = current;
    if (!state) return;
    setBusy(true);
    setError(null);
    setPending({ sender, body });
    try {
      await api(`/api/conversations/${state.conversation.id}/messages`, { body: { sender, body } });
      await Promise.all([loadState(state.customer.id), loadCustomers()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  async function setControl(mode: "sofia" | "mario") {
    const state = current;
    if (!state) return;
    setBusy(true);
    try {
      await api(`/api/conversations/${state.conversation.id}/control`, { body: { mode } });
      await Promise.all([loadState(state.customer.id), loadCustomers()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (current) await Promise.all([loadState(current.customer.id), loadCustomers()]);
  }

  return (
    <div className="flex h-full min-h-0">
      <ProspectList customers={customers} selected={selected} onSelect={select} onCreate={createProspect} />
      <div className="flex min-w-0 flex-1 flex-col">
        {error && (
          <div className="flex items-center justify-between border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            <span>{error}</span>
            <button className="text-xs underline" onClick={() => setError(null)}>
              cerrar
            </button>
          </div>
        )}
        {current ? (
          <ChatPanel state={current} busy={busy} pending={pending} onSend={send} onControl={setControl} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {selected ? "Cargando…" : "Crea o selecciona un prospecto para empezar a simular."}
          </div>
        )}
      </div>
      {current && <InsightPanel state={current} onChanged={refresh} onError={setError} />}
    </div>
  );
}

function ProspectList({
  customers,
  selected,
  onSelect,
  onCreate,
}: {
  customers: CustomerRow[];
  selected: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, phone: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <form
        className="space-y-2 border-b border-slate-200 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await onCreate(name.trim(), phone.trim());
          setName("");
          setPhone("");
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nuevo prospecto</p>
        <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Nombre (p. ej. Laura Méndez)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Teléfono (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit" tone="primary" small disabled={!name.trim()}>
          Crear prospecto
        </Button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {customers.length === 0 && <p className="p-3 text-xs text-slate-400">Aún no hay prospectos.</p>}
        {customers.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 ${selected === c.id ? "bg-emerald-50" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{c.displayName}</span>
              {c.openAlerts > 0 && <span title="Alerta para Mario">🔥</span>}
              {c.controlMode === "mario" && <Badge tone="blue">Mario</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {c.stage && <Badge>{CRM_STAGE_LABELS[c.stage]}</Badge>}
              {c.temperature && <Badge tone={TEMPERATURE_TONE[c.temperature]}>{TEMPERATURE_LABELS[c.temperature]}</Badge>}
              <span className="ml-auto text-[10px] text-slate-400">{fmtDate(c.lastMessageAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
