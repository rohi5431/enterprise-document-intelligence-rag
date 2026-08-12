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
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [localError, setLocalError] = useState("");

  const passwordStrength = useMemo(() => {
    if (password.length >= 12) return "Strong";
    if (password.length >= 8) return "Medium";
    if (password.length > 0) return "Weak";
    return "";
  }, [password]);

  const submit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
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

      if (password.length < 8) {
        setLocalError(
          "Password must be at least 8 characters."
        );
        return;
      }

      if (password !== confirmPassword) {
        setLocalError("Passwords do not match.");
        return;
      }

      await onRegister(
        trimmedEmail,
        password,
        trimmedName
      );
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
    <div className="auth-card">
      <div className="auth-header">
        <div>
          <p className="eyebrow">RAG AI Portal</p>
          <h1>
            {mode === "login"
              ? "Welcome back"
              : "Create an account"}
          </h1>
          <p className="brand-subtitle">
            Chat with your documents in a dark, focused workspace.
          </p>
        </div>

        <div className="auth-toggle" role="tablist">
          <button
            className={
              mode === "login" ? "active" : ""
            }
            onClick={() => switchMode("login")}
            type="button"
            disabled={loading}
          >
            Sign in
          </button>
          <button
            className={
              mode === "register" ? "active" : ""
            }
            onClick={() => switchMode("register")}
            type="button"
            disabled={loading}
          >
            Register
          </button>
        </div>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            disabled={loading}
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        {mode === "register" && (
          <label>
            Full name
            <input
              disabled={loading}
              value={fullName}
              onChange={(event) =>
                setFullName(event.target.value)
              }
              type="text"
              placeholder="Your name"
              autoComplete="name"
              required
            />
          </label>
        )}

        <label>
          Password
          <div className="password-row">
            <input
              disabled={loading}
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              minLength={8}
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              required
            />
            <button
              type="button"
              className="ghost-button password-toggle"
              onClick={() =>
                setShowPassword((prev) => !prev)
              }
              disabled={loading}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {mode === "register" && (
          <label>
            Confirm password
            <input
              disabled={loading}
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>
        )}

        {mode === "register" && password && (
          <div className="password-strength">
            Strength: {passwordStrength}
          </div>
        )}

        {(error || localError) && (
          <div className="alert">
            {localError || error}
          </div>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={loading}
        >
          {loading
            ? "Processing…"
            : mode === "login"
            ? "Sign in"
            : "Create account"}
        </button>
      </form>
    </div>
  );
}
