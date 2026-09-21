import { useState, type FormEvent } from "react";
import { Check, KeyRound, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Sparkle } from "@/components/ui/sparkle";

const MARKETS: Array<{ code: string; state: string }> = [
  { code: "EB", state: "Live" },
  { code: "PM", state: "Live" },
  { code: "ME", state: "Syncing" },
  { code: "DP", state: "Draft" },
];

export default function AuthPage() {
  const { signIn, signUp, configurationError } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null); setNotice(null); setBusy(true);
    try {
      if (mode === "signin") {
        const message = await signIn(email, password);
        if (message) setError(message);
      } else {
        const result = await signUp(email, password, displayName || email.split("@")[0] || "Seller");
        if (result.error) setError(result.error);
        else if (result.confirmationRequired) setNotice("Account created. Check your email to confirm your address, then sign in.");
        else setNotice("Account created. Your private workspace is ready.");
      }
    } finally { setBusy(false); }
  };

  const field = "h-11 w-full rounded-none border border-input bg-card pl-10 pr-3 text-sm outline-none transition focus:border-border focus:ring-2 focus:ring-primary/25";

  return (
    <main className="min-h-[100dvh] bg-background px-5 py-10 text-foreground sm:px-8">
      <section className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-5xl items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="tile-inverse corner-ticks hidden p-10 lg:block">
          <span className="flex h-10 w-10 items-center justify-center rounded-none bg-on-inverse text-inverse"><Sparkle size={20} /></span>
          <p className="mt-9 font-semibold text-[0.6875rem] uppercase tracking-[0.08em] text-label-on-inverse">Private resale operations</p>
          <h1 className="mt-4 max-w-md font-display text-4xl font-bold leading-[1.05] tracking-tight">List once. Sell everywhere. Stay in control.</h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-on-inverse-muted">CrossLinkOS keeps every seller's inventory, drafts, orders and shipping in a private workspace protected by your own account.</p>
          <div className="mt-9 flex flex-wrap gap-2">
            {MARKETS.map((market) => (
              <span key={market.code} className="inline-flex items-center gap-2 rounded-none border border-dot-on-inverse px-3 py-1.5 font-semibold text-[0.6875rem] uppercase tracking-[0.06em]">
                <span className="text-accent-alt">{market.code}</span>
                <span className="text-on-inverse-muted">{market.state}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md border-2 border-border bg-muted p-6 sm:p-8">
          <div className="mb-8 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-none bg-foreground text-accent-alt"><Sparkle size={16} /></span>
            <span className="text-[0.9375rem] font-extrabold tracking-tight">CrossLinkOS</span>
          </div>
          <p className="cx-eyebrow cx-bracket">Secure workspace access</p>
          <h2 className="mt-3 text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your seller workspace"}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "signin" ? "Sign in to see only your own inventory and sales." : "Start with a private account before adding any inventory or marketplace connection."}</p>

          <div className="mt-7 grid grid-cols-2 gap-1 rounded-none bg-muted p-1" role="tablist" aria-label="Sign in or create account">
            <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setError(null); setNotice(null); }} className={`h-10 rounded-none text-sm font-semibold transition ${mode === "signin" ? "bg-card text-foreground" : "text-ink-2 hover:text-foreground"}`}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setError(null); setNotice(null); }} className={`h-10 rounded-none text-sm font-semibold transition ${mode === "signup" ? "bg-card text-foreground" : "text-ink-2 hover:text-foreground"}`}>Create account</button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "signup" && (
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-2">Seller name</span>
                <span className="relative block"><UserRound size={16} className="pointer-events-none absolute left-3.5 top-3.5 text-muted-foreground" /><input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name or shop name" className={field} /></span></label>
            )}
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-2">Email</span>
              <span className="relative block"><Mail size={16} className="pointer-events-none absolute left-3.5 top-3.5 text-muted-foreground" /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={field} /></span></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-2">Password</span>
              <span className="relative block"><LockKeyhole size={16} className="pointer-events-none absolute left-3.5 top-3.5 text-muted-foreground" /><input required type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className={field} /></span></label>
            {configurationError && <p role="alert" className="rounded-none border border-destructive bg-danger-tint p-3 text-xs leading-5 text-destructive">{configurationError}</p>}
            {error && <p role="alert" className="rounded-none border border-destructive bg-danger-tint p-3 text-xs leading-5 text-destructive">{error}</p>}
            {notice && <p role="status" className="flex gap-2 rounded-none border border-border bg-success-tint p-3 text-xs leading-5 text-foreground"><Check size={14} className="mt-0.5 shrink-0" />{notice}</p>}
            <button disabled={busy || Boolean(configurationError)} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-none bg-primary border-2 border-foreground hover:bg-accent-hover px-4 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground transition  disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} {busy ? "Working…" : mode === "signin" ? "Enter workspace" : "Create private workspace"}
            </button>
          </form>
          <p className="mt-6 text-center font-semibold text-[0.6875rem] text-muted-foreground">Marketplace passwords are never stored here.</p>
        </div>
      </section>
    </main>
  );
}
