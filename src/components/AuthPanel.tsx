import { useMemo, useState, type FormEvent } from "react";

type AuthPanelProps = {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<void>;
  loading: boolean;
  error: string | null;
};

export function AuthPanel({
  onLogin,
  onRegister,
  loading,
  error,
}: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const passwordStrength = useMemo(() => {
    if (password.length >= 12) return "Strong";
    if (password.length >= 8) return "Medium";
    if (password.length > 0) return "Weak";
    return "";
  }, [password]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");

    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();

    if (!trimmedEmail || !password) return;

    if (mode === "register") {
      if (!trimmedName) {
        setLocalError("Full name is required.");
        return;
      }

      if (password.length < 4) {
        setLocalError("Password must be at least 4 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setLocalError("Passwords do not match.");
        return;
      }

      await onRegister(trimmedEmail, password, trimmedName);
      return;
    }

    await onLogin(trimmedEmail, password);
  };

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setLocalError("");
    setConfirmPassword("");
  };

  return (
    <div className="auth-card !p-5 sm:!p-6 !rounded-xl max-w-[440px] w-full border border-zinc-900 bg-zinc-950/40 backdrop-blur-md shadow-xl" id="auth-panel-card">
      <div className="auth-header !mb-2.5 !pb-2.5 border-b border-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="eyebrow !mb-0 text-[8px] tracking-wider text-orange-400 uppercase font-mono font-extrabold">RAG AI Portal</p>
          <h1 className="font-sans font-extrabold tracking-tight text-white text-sm">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="brand-subtitle font-sans text-[9px] text-zinc-500 mt-0.5">
            Chat with your documents.
          </p>
        </div>

        <div className="auth-toggle !p-0.5 !gap-0.5 text-[10px] shrink-0 self-start sm:self-center" role="tablist">
          <button
            className={`!py-0.5 !px-2 text-[10px] rounded-full ${mode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
            type="button"
            disabled={loading}
            id="auth-toggle-signin"
          >
            Sign in
          </button>
          <button
            className={`!py-0.5 !px-2 text-[10px] rounded-full ${mode === "register" ? "active" : ""}`}
            onClick={() => switchMode("register")}
            type="button"
            disabled={loading}
            id="auth-toggle-register"
          >
            Register
          </button>
        </div>
      </div>

      <form className="auth-form !gap-2" onSubmit={submit}>
        <label className="font-sans text-[9px] font-bold tracking-wider text-zinc-500 block uppercase">
          Email
          <input
            disabled={loading}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full mt-1 px-2.5 py-1.5 text-[11px] bg-zinc-950/60 border border-zinc-900/80 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-orange-500/60 focus:border-orange-500 placeholder:text-zinc-600 font-sans"
            id="auth-email-input"
          />
        </label>

        {mode === "register" && (
          <label className="font-sans text-[9px] font-bold tracking-wider text-zinc-500 block uppercase">
            Full Name
            <input
              disabled={loading}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              type="text"
              placeholder="Your name"
              autoComplete="name"
              required
              className="w-full mt-1 px-2.5 py-1.5 text-[11px] bg-zinc-950/60 border border-zinc-900/80 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-orange-500/60 focus:border-orange-500 placeholder:text-zinc-600 font-sans"
              id="auth-fullname-input"
            />
          </label>
        )}

        <label className="font-sans text-[9px] font-bold tracking-wider text-zinc-500 block uppercase">
          Password
          <div className="relative mt-1">
            <input
              disabled={loading}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              minLength={mode === "register" ? 4 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              className="w-full px-2.5 py-1.5 text-[11px] bg-zinc-950/60 border border-zinc-900/80 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-orange-500/60 focus:border-orange-500 placeholder:text-zinc-600 pr-12"
              id="auth-password-input"
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[7px] font-mono font-bold text-zinc-500 hover:text-zinc-300 tracking-wider"
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={loading}
              id="auth-show-password-btn"
            >
              {showPassword ? "HIDE" : "SHOW"}
            </button>
          </div>
        </label>

        {mode === "register" && (
          <label className="font-sans text-[9px] font-bold tracking-wider text-zinc-500 block uppercase">
            Confirm Password
            <input
              disabled={loading}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              minLength={mode === "register" ? 4 : undefined}
              autoComplete="new-password"
              required
              className="w-full mt-1 px-2.5 py-1.5 text-[11px] bg-zinc-950/60 border border-zinc-900/80 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-orange-500/60 focus:border-orange-500 placeholder:text-zinc-600"
              id="auth-confirm-password-input"
            />
          </label>
        )}

        {mode === "register" && password && (
          <div className="text-[9px] text-zinc-500 font-mono -mt-1">
            Strength: <span className="text-orange-400 font-bold">{passwordStrength}</span>
          </div>
        )}

        {(error || localError) && (
          <div className="alert !px-2.5 !py-1.5 bg-red-950/30 border border-red-900/40 text-red-200 text-[10px] rounded-md">
            {localError || error}
          </div>
        )}

        <button
          className="w-full mt-1.5 font-sans font-bold py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-black rounded-md cursor-pointer text-xs uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-orange-500/10"
          type="submit"
          disabled={loading}
          id="auth-submit-btn"
        >
          {loading
            ? "Processing…"
            : mode === "login"
            ? "Sign In"
            : "Create Account"}
        </button>
      </form>
    </div>
  );
}
