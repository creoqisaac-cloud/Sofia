import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/desk/ChatRoom";
import { getAppContext } from "@/server/app";
import { getChat } from "@/server/desk/chats";
import { ServiceError } from "@/server/services/errors";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const app = await getAppContext();
  const chat = await getChat(app, id).catch((e: unknown) => {
    if (e instanceof ServiceError && e.status === 404) return null;
    throw e;
  });
  if (!chat) notFound();
  return <ChatRoom customerId={id} initial={JSON.parse(JSON.stringify(chat))} />;
}
