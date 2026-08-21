import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, LockKeyhole, Mail, UserRound, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

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

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(hsl(var(--primary)/0.06)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.06)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <section className="relative mx-auto grid min-h-[calc(100dvh-5rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden rounded-3xl border border-border/70 bg-card/35 p-10 shadow-2xl backdrop-blur-xl lg:block">
          <div className="mb-9 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/60 bg-primary/10 text-primary shadow-[0_0_28px_hsl(var(--primary)/0.24)]"><Zap size={22} /></div>
          <p className="cx-eyebrow">Private resale operations</p>
          <h1 className="mt-4 max-w-md font-pixel text-2xl leading-tight text-foreground">Your inventory. Your marketplace drafts. Your mission control.</h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-muted-foreground">CrossLinkOS keeps each seller’s listings, photos, orders, fulfillment work, analytics, and future marketplace connections in a private workspace protected by your own account.</p>
          <div className="mt-10 grid gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/35 p-4"><LockKeyhole size={16} className="text-primary" /> User-scoped inventory and sales operations</div>
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/35 p-4"><KeyRound size={16} className="text-secondary" /> Marketplace passwords are never stored here</div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md rounded-3xl border border-border/80 bg-card/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/50 bg-primary/10 text-primary"><Zap size={18} /></span><div><p className="font-pixel text-xs">CrossLinkOS</p><p className="cx-eyebrow mt-1 text-[0.56rem]">resale mission control</p></div></div>
          <p className="cx-eyebrow">Secure workspace access</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">{mode === "signin" ? "Welcome back" : "Create your seller workspace"}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "signin" ? "Sign in to access only your inventory and operational data." : "Start with a private account before adding any inventory or marketplace connection."}</p>

          <div className="mt-7 grid grid-cols-2 rounded-xl border border-border/70 bg-background/45 p-1">
            <button type="button" onClick={() => { setMode("signin"); setError(null); setNotice(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "signin" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setError(null); setNotice(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "signup" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>Create account</button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "signup" && <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Seller name</span><span className="relative block"><UserRound size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name or shop name" className="h-10 w-full rounded-lg border border-input bg-background/60 pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></span></label>}
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Email</span><span className="relative block"><Mail size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-10 w-full rounded-lg border border-input bg-background/60 pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></span></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Password</span><span className="relative block"><LockKeyhole size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input required type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className="h-10 w-full rounded-lg border border-input bg-background/60 pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></span></label>
            {configurationError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-5 text-destructive">{configurationError}</p>}
            {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-5 text-destructive">{error}</p>}
            {notice && <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs leading-5 text-accent">{notice}</p>}
            <button disabled={busy || Boolean(configurationError)} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} {busy ? "Working…" : mode === "signin" ? "Enter workspace" : "Create private workspace"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
