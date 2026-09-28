import { MobileHeader } from "@/components/app/AppShell";
import { OpenPlateCaseButton } from "@/components/sofia/PlateForms";

export default async function NewPlateCasePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  return (
    <>
      <MobileHeader title="Placas" back={customer ? `/customers/${customer}` : "/plates"} />
      <div className="mx-auto max-w-xl px-4">
        <p className="mb-4 text-[15px] text-dim">Se abrirá el trámite con los requisitos que tengas capturados (cada uno con su fuente).</p>
        {customer ? <OpenPlateCaseButton customerId={customer} /> : <p className="text-alert">Falta el cliente.</p>}
      </div>
    </>
  );
}
