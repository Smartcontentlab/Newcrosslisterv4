import type { NextFunction, Request, RequestHandler, Response } from "express";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type SupabaseAuthUser = {
  id?: string;
  email?: string | null;
};

function getServerEnv(name: string): string | undefined {
  const netlifyEnv = (globalThis as { Netlify?: { env?: { get: (key: string) => string | undefined } } }).Netlify?.env;
  return netlifyEnv?.get(name) ?? process.env[name];
}

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

  const supabaseUrl = getServerEnv("SUPABASE_URL");
  const publishableKey = getServerEnv("SUPABASE_PUBLISHABLE_KEY");
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
