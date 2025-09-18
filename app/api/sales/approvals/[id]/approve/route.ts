import { handleApprove } from "./handler";
import type { RouteContext } from "./handler";

export async function POST(request: Request, context: RouteContext) {
  return handleApprove(request, context);
}
