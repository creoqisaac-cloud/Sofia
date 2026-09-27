import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { createCustomer, listCustomers } from "@/server/services/customers";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const app = await getAppContext();
  return { customers: await listCustomers(app) };
});

const CreateSchema = z.object({ displayName: z.string().min(1).max(120), phone: z.string().max(30).nullish() });

export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  const body = await parseBody(request, CreateSchema);
  const { customer, conversation } = await createCustomer(app, body);
  return { customerId: customer.id, conversationId: conversation.id };
});
