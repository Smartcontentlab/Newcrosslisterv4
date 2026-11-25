import type { NextFunction, Request, RequestHandler, Response } from "express";

import { isAgentKey, verifyAgentKey } from "./agent-keys";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  /** "agent_key" when the request used an access key rather than the seller's login. */
  via?: "session" | "agent_key";
};

type SupabaseAuthUser = {
  id?: string;
  email?: string | null;
};

// Deliberately no fallback project: an unset variable must surface as
// "not configured", not as calls to a Supabase project that may be gone.

function getBearerToken(request: Request): string | null {
  const header = request.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ", 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export function getAuthenticatedUser(response: Response): AuthenticatedUser {
  const user = response.locals.authUser as AuthenticatedUser | undefined;
  if (!user) throw new Error("Authenticated user context is missing");
  return user;
}

export const requireAuth: RequestHandler = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  const token = getBearerToken(request);
  if (!token) {
    response.status(401).json({ error: "Authentication is required" });
    return;
  }

  // Access keys for helper programs (Hermes, extension auto-post) instead of a browser login.
  if (isAgentKey(token)) {
    try {
      const verified = await verifyAgentKey(token);
      if (!verified) { response.status(401).json({ error: "This access key is not valid or was revoked. Create a new one in CrossLinkOS Settings." }); return; }
      response.locals.authUser = { id: verified.userId, email: null, via: "agent_key" } satisfies AuthenticatedUser;
      next();
    } catch (error) {
      request.log?.error({ err: error }, "Unable to check access key");
      response.status(503).json({ error: "The access key could not be checked right now. Try again shortly." });
    }
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !publishableKey) {
    response.status(503).json({ error: "Authentication is not configured" });
    return;
  }

  try {
    const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!authResponse.ok) {
      response.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
      return;
    }

    const user = await authResponse.json() as SupabaseAuthUser;
    if (!user.id) {
      response.status(401).json({ error: "Your session did not include an account identity" });
      return;
    }

    response.locals.authUser = { id: user.id, email: user.email ?? null } satisfies AuthenticatedUser;
    next();
  } catch (error) {
    request.log?.error({ err: error }, "Unable to validate Supabase access token");
    response.status(503).json({ error: "Authentication service is temporarily unavailable" });
  }
};
