"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RequestError, post } from "@/lib/client";

type Mode = "login" | "signup";

const COPY = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to keep your streak on the board.",
    submit: "Log in",
    endpoint: "/api/auth/login",
    switchText: "New here?",
    switchLabel: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    title: "Create your account",
    subtitle: "Takes ten seconds. The game takes sixty.",
    submit: "Start playing",
    endpoint: "/api/auth/signup",
    switchText: "Already have an account?",
    switchLabel: "Log in",
    switchHref: "/login",
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const copy = COPY[mode];

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const data = Object.fromEntries(new FormData(event.currentTarget));

    try {
      await post(copy.endpoint, data);
      router.replace("/");
      router.refresh();
    } catch (cause) {
      if (cause instanceof RequestError) {
        setError(cause.message);
        setFieldErrors(cause.details ?? {});
      } else {
        setError("Could not reach the server. Check your connection and try again.");
      }
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm py-12">
      <div className="panel animate-slide-up p-7">
        <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted">{copy.subtitle}</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          {mode === "signup" && (
            <Field
              name="username"
              label="Username"
              autoComplete="username"
              placeholder="fastfingers"
              errors={fieldErrors.username}
            />
          )}

          <Field
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            placeholder="you@example.com"
            errors={fieldErrors.email}
          />

          <Field
            name="password"
            type="password"
            label="Password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
            errors={fieldErrors.password}
          />

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-xl bg-gradient-to-r from-cyan to-violet px-4 py-3 font-bold text-void transition-transform hover:scale-[1.02] disabled:scale-100 disabled:opacity-60"
          >
            {pending ? "One moment…" : copy.submit}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-muted">
        {copy.switchText}{" "}
        <Link href={copy.switchHref} className="text-cyan underline-offset-4 hover:underline">
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  );
}

function Field({
  name,
  label,
  errors,
  type = "text",
  ...props
}: {
  name: string;
  label: string;
  errors?: string[];
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const invalid = Boolean(errors?.length);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </label>
      <input
        {...props}
        id={id}
        name={name}
        type={type}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={`rounded-xl border bg-void/60 px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:text-muted/50 focus:ring-2 ${
          invalid
            ? "border-danger/60 focus:ring-danger/40"
            : "border-border focus:border-cyan/60 focus:ring-cyan/30"
        }`}
      />
      {invalid && (
        <p id={errorId} className="text-xs text-danger">
          {errors?.[0]}
        </p>
      )}
    </div>
  );
}
