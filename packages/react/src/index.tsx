"use client";

import {
  createNamoIDClient,
  type HostedAuthMode,
  type NamoIDAuthConfig,
  type NamoIDClient,
  type NamoIDClientOptions,
  type NamoIDTokenResponse,
} from "@namoidhq/js";
import {
  createContext,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type NamoIDProviderProps = NamoIDClientOptions & {
  children: ReactNode;
};

const NamoIDContext = createContext<NamoIDClient | null>(null);

export function NamoIDProvider({
  children,
  publishableKey,
  apiBaseUrl,
  fetcher,
}: NamoIDProviderProps) {
  const client = useMemo(
    () => createNamoIDClient({ publishableKey, apiBaseUrl, fetcher }),
    [publishableKey, apiBaseUrl, fetcher],
  );

  return <NamoIDContext.Provider value={client}>{children}</NamoIDContext.Provider>;
}

export function useNamoID(): NamoIDClient {
  const client = useContext(NamoIDContext);
  if (!client) {
    throw new Error("useNamoID must be used inside <NamoIDProvider>");
  }
  return client;
}

export type UseAuthConfigState = {
  config: NamoIDAuthConfig | null;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
};

export function useAuthConfig(): UseAuthConfigState {
  const client = useNamoID();
  const [config, setConfig] = useState<NamoIDAuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        setConfig(await client.auth.getConfig());
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load NamoID config"));
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { config, loading, error, reload };
}

export type HostedAuthButtonProps = {
  mode?: HostedAuthMode;
  returnTo: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
};

export function HostedAuthButton({
  mode = "sign_in",
  returnTo,
  children,
  className,
  style,
  disabled,
}: HostedAuthButtonProps) {
  const client = useNamoID();
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const transaction = await client.hostedAuth.createPublicTransaction();
      sessionStorage.setItem(
        transactionStorageKey(client.publishableKey),
        JSON.stringify(transaction),
      );
      await client.hostedAuth.redirect({
        mode,
        returnTo,
        state: transaction.state,
        completionMode: "public",
        codeChallenge: transaction.codeChallenge,
        codeChallengeMethod: transaction.codeChallengeMethod,
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      style={{ ...styles.button, ...style }}
      disabled={disabled || starting || !returnTo}
      onClick={() => void start()}
    >
      {children ?? labelForMode(mode)}
    </button>
  );
}

export type AuthFlowProps = {
  returnTo: string;
  className?: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
  loadingLabel?: string;
  unavailableLabel?: string;
};

export function SignIn(props: AuthFlowProps) {
  return (
    <AuthPanel
      {...props}
      mode="sign_in"
      title={props.title ?? "Sign in"}
      description={props.description ?? "Continue with the sign-in methods enabled for this app."}
      buttonLabel={props.buttonLabel ?? "Sign in with NamoID"}
      enabled={(config) => config.signin_methods.length > 0}
    />
  );
}

export function SignUp(props: AuthFlowProps) {
  return (
    <AuthPanel
      {...props}
      mode="sign_up"
      title={props.title ?? "Create account"}
      description={props.description ?? "Start the hosted signup flow for this app."}
      buttonLabel={props.buttonLabel ?? "Sign up with NamoID"}
      unavailableLabel={props.unavailableLabel ?? "Signups are currently paused."}
      enabled={(config) => config.access_mode !== "closed"}
    />
  );
}

export type WaitlistProps = Omit<AuthFlowProps, "buttonLabel"> & {
  buttonLabel?: string;
  onSubmitEmail?: (email: string, config: NamoIDAuthConfig | null) => Promise<void> | void;
};

export function Waitlist({
  onSubmitEmail,
  buttonLabel = "Join waitlist",
  title = "Join the waitlist",
  description = "Leave your email and we will route you through the configured access flow.",
  ...props
}: WaitlistProps) {
  const { config, loading, error } = useAuthConfig();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const canSubmitLocally = Boolean(onSubmitEmail);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (onSubmitEmail) {
      await onSubmitEmail(email, config);
      setSubmitted(true);
    }
  };

  return (
    <section className={props.className} style={styles.card}>
      <PanelHeader title={title} description={description} />
      <StatusLine config={config} loading={loading} error={error} />
      {submitted ? (
        <p style={styles.success}>You are on the list.</p>
      ) : (
        <form onSubmit={submit} style={styles.form}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            style={styles.input}
          />
          {canSubmitLocally ? (
            <button type="submit" style={styles.button}>
              {buttonLabel}
            </button>
          ) : (
            <HostedAuthButton {...props} mode="waitlist">
              {buttonLabel}
            </HostedAuthButton>
          )}
        </form>
      )}
    </section>
  );
}

export function AuthCard(props: AuthFlowProps & { mode?: HostedAuthMode }) {
  if (props.mode === "sign_up") return <SignUp {...props} />;
  if (props.mode === "waitlist") return <Waitlist {...props} />;
  return <SignIn {...props} />;
}

function AuthPanel({
  mode,
  title,
  description,
  buttonLabel,
  loadingLabel = "Loading auth configuration...",
  unavailableLabel = "This flow is not enabled right now.",
  enabled,
  className,
  ...buttonOptions
}: AuthFlowProps & {
  mode: HostedAuthMode;
  title: string;
  description: string;
  buttonLabel: string;
  loadingLabel?: string;
  unavailableLabel?: string;
  enabled: (config: NamoIDAuthConfig) => boolean;
}) {
  const { config, loading, error } = useAuthConfig();
  const isEnabled = config ? enabled(config) : false;

  return (
    <section className={className} style={styles.card}>
      <PanelHeader title={title} description={description} />
      <StatusLine config={config} loading={loading} error={error} loadingLabel={loadingLabel} />
      <HostedAuthButton {...buttonOptions} mode={mode} disabled={loading || Boolean(error) || !isEnabled}>
        {isEnabled ? buttonLabel : unavailableLabel}
      </HostedAuthButton>
    </section>
  );
}

function PanelHeader({ title, description }: { title: string; description: string }) {
  return (
    <div style={styles.header}>
      <h2 style={styles.title}>{title}</h2>
      <p style={styles.description}>{description}</p>
    </div>
  );
}

function StatusLine({
  config,
  loading,
  error,
  loadingLabel = "Loading auth configuration...",
}: {
  config: NamoIDAuthConfig | null;
  loading: boolean;
  error: Error | null;
  loadingLabel?: string;
}) {
  if (loading) return <p style={styles.meta}>{loadingLabel}</p>;
  if (error) return <p style={styles.error}>{error.message}</p>;
  if (!config) return null;
  return (
    <p style={styles.meta}>
      {config.access_mode} access · {config.signin_methods.length} sign-in method
      {config.signin_methods.length === 1 ? "" : "s"}
    </p>
  );
}

function labelForMode(mode: HostedAuthMode): string {
  if (mode === "sign_up") return "Sign up with NamoID";
  if (mode === "waitlist") return "Join waitlist";
  return "Sign in with NamoID";
}

export async function completeHostedAuthRedirect(
  client: NamoIDClient,
  callbackUrl: string = window.location.href,
): Promise<NamoIDTokenResponse> {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const storageKey = transactionStorageKey(client.publishableKey);
  const raw = sessionStorage.getItem(storageKey);
  if (!code || !returnedState || !raw) {
    throw new Error("Hosted Auth callback is missing its transaction");
  }
  const transaction = JSON.parse(raw) as { state: string; codeVerifier: string };
  if (transaction.state !== returnedState) {
    throw new Error("Hosted Auth state mismatch");
  }
  sessionStorage.removeItem(storageKey);
  return client.hostedAuth.exchangeCode({ code, codeVerifier: transaction.codeVerifier });
}

function transactionStorageKey(publishableKey: string): string {
  return `namoid_hosted_auth:${publishableKey.slice(-12)}`;
}

const styles: Record<string, CSSProperties> = {
  card: {
    border: "1px solid #deded8",
    borderRadius: 8,
    padding: 18,
    background: "#ffffff",
    color: "#111111",
    display: "grid",
    gap: 14,
  },
  header: {
    display: "grid",
    gap: 4,
  },
  title: {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.2,
    fontWeight: 650,
  },
  description: {
    margin: 0,
    color: "#62645f",
    fontSize: 14,
    lineHeight: 1.45,
  },
  meta: {
    margin: 0,
    color: "#73756f",
    fontSize: 12,
  },
  error: {
    margin: 0,
    color: "#9f1d1d",
    fontSize: 12,
  },
  success: {
    margin: 0,
    color: "#17633e",
    fontSize: 14,
  },
  form: {
    display: "grid",
    gap: 10,
  },
  input: {
    border: "1px solid #c9cac2",
    borderRadius: 7,
    padding: "10px 12px",
    fontSize: 14,
  },
  button: {
    border: 0,
    borderRadius: 7,
    background: "#111111",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 650,
    minHeight: 42,
    padding: "0 16px",
  },
};
