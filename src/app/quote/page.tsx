import { MobileHeader } from "@/components/app/AppShell";
import { QuoteForm } from "@/components/sofia/QuoteForm";
import { getAppContext } from "@/server/app";
import { catalogModels } from "@/server/command/router";

export default async function QuotePage({ searchParams }: { searchParams: Promise<{ model?: string; version?: string; down?: string; term?: string }> }) {
  const sp = await searchParams;
  const models = await catalogModels(await getAppContext());
  return (
    <>
      <MobileHeader title="Cotizar" back="/" subtitle="Solo cifras con fuente · el enganche nunca sube el bono" />
      <div className="mx-auto max-w-xl px-4 pb-8">
        <QuoteForm models={models} defaults={{ model: sp.model, version: sp.version, downPayment: sp.down, termMonths: sp.term }} />
      </div>
    </>
  );
}
