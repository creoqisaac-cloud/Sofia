import { z } from "zod";
import { getAppContext } from "@/server/app";
import { ingestPaste, listChats } from "@/server/desk/chats";
import { handle, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = handle(async (request: Request) => {
  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  return { chats: await listChats(await getAppContext(), { q }) };
});

const Ingest = z.object({
  customerId: z.string().uuid().nullish(),
  name: z.string().max(120).nullish(),
  phone: z.string().max(30).nullish(),
  text: z.string().min(1).max(12000),
  as: z.enum(["auto", "customer", "mario"]).optional(),
});

/** Mario pega lo que le escribió el cliente (o lo que él contestó). */
export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Ingest);
  return ingestPaste(await getAppContext(), body);
});
