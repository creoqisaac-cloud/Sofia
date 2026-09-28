import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { APP_TONE, ApplicationProgress, StatusTimeline } from "@/components/app/cards";
import { ApplicationStatusForm, ConfirmAllButton, ConfirmFactButton, ConflictCard, GeneratePdfButton, ProfileSectionForm, type EditableField } from "@/components/app/forms";
import { ChipNav, DemoPill, EmptyState, Pill, SectionCard, fmtDate } from "@/components/app/ui";
import { MANUAL_TRANSITIONS, type SlotAnalysis, type SlotCategory } from "@/domain/credit";
import { CREDIT_APPLICATION_STATUS_LABELS, type CreditApplicationStatus } from "@/domain/enums";
import { PROFILE_FIELD_DEFS, PROFILE_SECTION_LABELS, type ProfileSection } from "@/domain/profile-fields";
import { getAppContext } from "@/server/app";
import { getApplicationDetail } from "@/server/services/credit";

const STEPS = [
  ["analisis", "1 · Análisis"],
  ["clasificacion", "2 · Clasificación"],
  ["completar", "3 · Completar"],
  ["revision", "4 · Vista previa"],
  ["pdf", "5 · PDF"],
] as const;

const GROUPS: Array<{ category: SlotCategory; icon: string; label: string }> = [
  { category: "confirmed", icon: "✅", label: "Confirmados" },
  { category: "conflict", icon: "⚠️", label: "Conflictivos" },
  { category: "missing", icon: "⬜", label: "Faltantes" },
  { category: "needs_confirmation", icon: "🔎", label: "Por confirmar (dato observado)" },
  { category: "optional", icon: "ℹ️", label: "Opcionales" },
  { category: "human", icon: "👤", label: "Requieren confirmación humana" },
  { category: "signature", icon: "✍️", label: "Requieren firma" },
  { category: "not_applicable", icon: "·", label: "Condicionales que no aplican" },
];

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string; appId: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id, appId } = await params;
  const { step = "analisis" } = await searchParams;
  const app = await getAppContext();
  const d = await getApplicationDetail(app, appId);
  const { analysis, application, institution, template, profile } = d;
  const active = STEPS.some(([k]) => k === step) ? step : "analisis";
  const status = application.status as CreditApplicationStatus;
  const bySection = (slots: SlotAnalysis[]) => d.adapter.sections.map((sec) => ({ ...sec, slots: slots.filter((s) => s.slot.section === sec.id) })).filter((g) => g.slots.length);

  // Campos a completar: faltantes + respuestas que habilitan condicionales.
  const conditionKeys = Array.from(new Set(d.adapter.slots.map((s) => s.condition?.profileKey).filter((k): k is string => Boolean(k) && profile.fields[k!]?.state.status === "missing")));
  const toFill = Array.from(new Set([...analysis.missingKeys, ...conditionKeys])).filter((k) => PROFILE_FIELD_DEFS[k]);
  const fillBySection = new Map<ProfileSection, string[]>();
  for (const k of toFill) {
    const sec = PROFILE_FIELD_DEFS[k]!.section;
    fillBySection.set(sec, [...(fillBySection.get(sec) ?? []), k]);
  }
  const editable = (keys: string[]): EditableField[] =>
    keys.map((k) => {
      const f = profile.fields[k]!;
      return { key: k, label: f.label, kind: f.kind, inputMode: f.inputMode, enumOptions: f.enumOptions, value: null, status: f.state.status, sourceLabel: f.state.sourceLabel };
    });
  const t = analysis.totals;
  const blocked =
    t.conflicts || t.missing || t.needsConfirmation
      ? `Se generará un BORRADOR: ${t.missing + t.needsConfirmation} dato(s) quedarán vacíos y ${t.conflicts} conflicto(s) no se llenarán.`
      : null;

  return (
    <>
      <MobileHeader
        back={`/customers/${id}/credit`}
        title={`Solicitud ${institution.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            <Pill tone={APP_TONE[status]}>{CREDIT_APPLICATION_STATUS_LABELS[status]}</Pill>
            {template && <span className="text-xs text-faint">{template.name}</span>}
            <DemoPill show={Boolean(template?.isDemo)} />
          </span>
        }
      />
      <Page>
        <ChipNav active={active} items={STEPS.map(([k, label]) => ({ key: k, label, href: `/customers/${id}/credit/${appId}?step=${k}` }))} />

        {active === "analisis" && (
          <>
            <SectionCard title="Lo que Sofía ya sabe" subtitle="Solo los datos confirmados se usan para llenar la solicitud.">
              <ApplicationProgress sections={analysis.sections} />
            </SectionCard>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {[
                ["✅", "Confirmados", t.confirmed],
                ["🔎", "Por confirmar", t.needsConfirmation],
                ["⚠️", "Conflictos", t.conflicts],
                ["⬜", "Faltantes", t.missing],
              ].map(([i, l, n]) => (
                <div key={String(l)} className="rounded-2xl bg-panel p-3">
                  <div className="text-2xl font-bold text-ivory">{n}</div>
                  <div className="text-xs text-zinc-400">
                    {i} {l}
                  </div>
                </div>
              ))}
            </div>
            <Link href={`/customers/${id}/credit/${appId}?step=${t.conflicts || t.missing || t.needsConfirmation ? "completar" : "revision"}`} className="block rounded-xl bg-emerald-500 py-3 text-center text-base font-semibold text-zinc-950">
              {t.conflicts || t.missing || t.needsConfirmation ? "Completar lo necesario" : "Ir a vista previa"}
            </Link>
          </>
        )}

        {active === "clasificacion" &&
          GROUPS.map((g) => {
            const slots = analysis.slots.filter((s) => s.category === g.category);
            if (!slots.length) return null;
            return (
              <details key={g.category} open={g.category !== "confirmed" && g.category !== "not_applicable"} className="rounded-2xl bg-panel p-4">
                <summary className="flex min-h-8 cursor-pointer items-center justify-between text-base font-semibold text-zinc-100">
                  <span>
                    {g.icon} {g.label}
                  </span>
                  <span className="text-sm text-zinc-400">{slots.length}</span>
                </summary>
                <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                  {slots.map((s) => (
                    <li key={s.slot.slot}>
                      {s.slot.label}
                      {s.slot.condition && <span className="text-faint"> — {s.slot.condition.description}</span>}
                      {s.slot.note && g.category !== "confirmed" && <span className="block text-xs text-faint">{s.slot.note}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}

        {active === "completar" && (
          <>
            {analysis.conflictKeys.map((k) => {
              const f = profile.fields[k]!;
              return <ConflictCard key={k} customerId={id} fieldKey={k} label={f.label} candidates={f.state.candidates.map((c) => ({ factId: c.factId, display: String(c.value), sourceLabel: c.sourceLabel }))} />;
            })}
            {analysis.confirmKeys.length > 0 && (
              <SectionCard title="🔎 Confirmar datos observados" subtitle="Revisa y confirma. Solo lo confirmado se usa en la solicitud.">
                <div className="mb-3 space-y-2">
                  {Array.from(new Set(analysis.confirmKeys.map((k) => profile.fields[k]!.state.sourceLabel ?? "Sin fuente"))).map((src) => {
                    const ids = analysis.confirmKeys.filter((k) => (profile.fields[k]!.state.sourceLabel ?? "Sin fuente") === src).map((k) => profile.fields[k]!.state.factId!);
                    return <ConfirmAllButton key={src} customerId={id} factIds={ids} label={`Confirmar todos de “${src}” (${ids.length})`} />;
                  })}
                </div>
                <ul className="divide-y divide-zinc-800">
                  {analysis.confirmKeys.map((k) => {
                    const f = profile.fields[k]!;
                    return (
                      <li key={k} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-faint">
                            {f.label} · {f.state.sourceLabel}
                          </div>
                          <div className="break-all text-base text-zinc-100">{f.state.display}</div>
                        </div>
                        <ConfirmFactButton customerId={id} factId={f.state.factId!} />
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            )}
            {[...fillBySection.entries()].map(([sec, keys]) => (
              <SectionCard key={sec} title={`⬜ ${PROFILE_SECTION_LABELS[sec]}`} subtitle={`${keys.length} dato(s) por capturar`}>
                <ProfileSectionForm customerId={id} section={sec} fields={editable(keys)} />
              </SectionCard>
            ))}
            {!analysis.conflictKeys.length && !analysis.confirmKeys.length && !toFill.length && <EmptyState>No falta ningún dato del perfil. Revisa la vista previa.</EmptyState>}
            {analysis.slots.some((s) => s.category === "missing" && !(s.slot.profileKeys ?? []).length) && (
              <p className="text-xs text-faint">Los datos de coacreditado/obligado solidario se capturan directamente en el formato por ahora.</p>
            )}
          </>
        )}

        {active === "revision" && (
          <>
            <SectionCard title={`Solicitud ${institution.name}`}>
              <ul className="space-y-1 text-base">
                <li>✅ Datos confirmados: {t.confirmed}</li>
                <li>⬜ Datos faltantes: {t.missing + t.needsConfirmation}</li>
                <li>⚠️ Conflictos: {t.conflicts}</li>
                <li>👤 Confirmaciones manuales: {t.human}</li>
                <li>✍️ Firmas: {t.signatures}</li>
              </ul>
              <p className="mt-2 text-xs text-faint">El PDF es un borrador: las confirmaciones personales (PEP, salud, autorizaciones) y las firmas las completa el cliente.</p>
            </SectionCard>
            {bySection(analysis.slots).map((g) => (
              <SectionCard key={g.id} title={g.label}>
                <ul className="divide-y divide-zinc-800">
                  {g.slots.map((s) => (
                    <li key={s.slot.slot} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <span className="text-zinc-400">{s.slot.label}</span>
                      <span className="text-right text-zinc-100">
                        {s.category === "confirmed" ? (s.slot.pdfType === "checkbox" ? (s.checked ? "☑" : "☐") : s.value) : <Pill tone={s.category === "conflict" ? "red" : s.category === "missing" || s.category === "needs_confirmation" ? "amber" : "neutral"}>{GROUPS.find((x) => x.category === s.category)?.icon} {GROUPS.find((x) => x.category === s.category)?.label}</Pill>}
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ))}
            <Link href={`/customers/${id}/credit/${appId}?step=pdf`} className="block rounded-xl bg-emerald-500 py-3 text-center text-base font-semibold text-zinc-950">
              Continuar a PDF
            </Link>
          </>
        )}

        {active === "pdf" && (
          <>
            <SectionCard title="Borrador PDF" subtitle="Copia nueva de la plantilla. Sin firmas, sin PEP, sin consentimientos marcados.">
              <GeneratePdfButton customerId={id} applicationId={appId} blocked={blocked} />
            </SectionCard>
            <SectionCard title="Borradores generados">
              {d.generated.length === 0 ? (
                <EmptyState>Aún no se ha generado ningún borrador.</EmptyState>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {d.generated.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div>
                        <div className="text-zinc-100">{fmtDate(g.generatedAt, true)}</div>
                        <div className="text-xs text-faint">
                          {g.fieldsFilled.length} campos llenados · {g.fieldsSkipped.length} vacíos · fuentes: {Array.from(new Set(g.sourcesUsed.map((x) => x.sourceLabel).filter(Boolean))).join(", ")}
                        </div>
                      </div>
                      <a href={`/api/documents/generated/${g.id}`} target="_blank" rel="noreferrer" className="shrink-0 text-sand">
                        Abrir
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Estado de la solicitud">
              <ApplicationStatusForm customerId={id} applicationId={appId} options={(MANUAL_TRANSITIONS[status] ?? []).map((v) => ({ value: v, label: CREDIT_APPLICATION_STATUS_LABELS[v as CreditApplicationStatus] }))} />
              <div className="mt-4">
                <StatusTimeline
                  items={d.events.map((e) => ({
                    id: e.id,
                    title: `${e.fromStatus ? `${CREDIT_APPLICATION_STATUS_LABELS[e.fromStatus]} → ` : ""}${CREDIT_APPLICATION_STATUS_LABELS[e.toStatus]}`,
                    detail: e.reason,
                    at: e.createdAt,
                    actor: e.actorType,
                  }))}
                />
              </div>
            </SectionCard>
          </>
        )}
      </Page>
    </>
  );
}
