import { MobileHeader } from "@/components/app/AppShell";
import { BoardApp } from "@/components/desk/BoardApp";
import { DeskTabs } from "@/components/desk/ui";
import { getAppContext } from "@/server/app";
import { getBoard } from "@/server/desk/pipeline";

export const dynamic = "force-dynamic";

export default async function TableroPage() {
  const board = await getBoard(await getAppContext());
  return (
    <>
      <MobileHeader title="Tablero" subtitle={`${board.cards.length} clientes · acomódalos a tu gusto`} />
      <div className="mx-auto flex max-w-[100rem] flex-col gap-4 px-4 py-4">
        <DeskTabs />
        <BoardApp initial={JSON.parse(JSON.stringify(board))} />
      </div>
    </>
  );
}
