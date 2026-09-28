import { MobileHeader } from "@/components/app/AppShell";
import { CalibrateButton } from "@/components/sofia/ReturnForms";
import { PROGRAM_CALIBRATION_LABELS, type CalibrationReport, type ProgramCalibrationStatus } from "@/domain/quote-v2";
import { getAppContext } from "@/server/app";
import { listProgramsWithStatus } from "@/server/services/quote-v2";

/** Programas de financiamiento y su calibración contra corridas reales. */
export default async function ProgramsPage() {
  const app = await getAppContext();
  const programs = await listProgramsWithStatus(app);
  return (
    <>
      <MobileHeader title="Programas" back="/more" subtitle="Exactitud del cotizador" />
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-8">
        <p className="text-[14px] text-dim">Un programa solo produce corridas “exactas” si reproduce sin diferencias las corridas reales de Mario. Nada se ajusta a mano para cuadrar.</p>
        {programs.map((p) => {
          const report = p.calibrationReport as unknown as CalibrationReport | null;
          const status = p.calibrationStatus as ProgramCalibrationStatus;
          return (
            <section key={p.id} className="rounded-3xl bg-panel p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[17px] font-medium text-ivory">{p.name}</h2>
                {p.isDemo && <span className="text-[11px] text-sand">DEMO</span>}
              </div>
              <div className="text-[14px] text-dim">
                {p.lender} · {p.exampleCount} corrida(s) de referencia
              </div>
              <div className={`mt-2 text-[15px] ${status === "validated" ? "text-good" : "text-alert"}`}>{PROGRAM_CALIBRATION_LABELS[status] ?? status}</div>
              {report && <p className="mt-1 text-[14px] text-dim">{report.summary}</p>}
              {report?.cases
                .filter((c) => !c.passed)
                .map((c) => (
                  <div key={c.exampleId} className="mt-2 rounded-xl bg-raise p-3 text-[13px] text-dim">
                    <div className="text-ivory">{c.label}</div>
                    {c.missing.map((m) => (
                      <div key={m}>· {m}</div>
                    ))}
                    {c.diffs
                      .filter((d) => d.diff === null || Math.abs(d.diff) >= 0.01)
                      .map((d) => (
                        <div key={d.key}>
                          · {d.key}: esperado {d.expected} · obtenido {d.actual ?? "—"}
                        </div>
                      ))}
                  </div>
                ))}
              <div className="mt-3">
                <CalibrateButton programId={p.id} />
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
