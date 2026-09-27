import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { previewQuote } from "@/server/services/commercial";

const Schema = z.object({
  model: z.string().min(1),
  version: z.string().min(1),
  downPayment: z.number().nonnegative(),
  termMonths: z.number().int().positive().nullable(),
  paymentMethod: z.enum(["financing", "cash"]),
});

export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  return previewQuote(app, await parseBody(request, Schema));
});
