"use client";

import {
  createNamoIDClient,
  NamoIDError,
  type NamoIDAuthConfig,
  type NamoIDClient,
  type NamoIDClientOptions,
  type NamoIDTokenResponse,
  type NamoIDUserInfo,
  type OIDCTransaction,
} from "@namoidhq/js";
import { validateOIDCIdToken, type ValidatedIDToken } from "@namoidhq/js/server";
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type NamoIDProviderProps = NamoIDClientOptions & { children: ReactNode };

const NamoIDContext = createContext<NamoIDClient | null>(null);

export function NamoIDProvider({ children, clientId, fetcher }: NamoIDProviderProps) {
  const client = useMemo(
    () => createNamoIDClient({ clientId, fetcher }),
    [clientId, fetcher],
  );
  return <NamoIDContext.Provider value={client}>{children}</NamoIDContext.Provider>;
}

export function useNamoID(): NamoIDClient {
  const client = useContext(NamoIDContext);
  if (!client) throw new Error("useNamoID must be used inside <NamoIDProvider>");
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
      } catch (value) {
        setError(value instanceof Error ? value : new Error("Failed to load NamoID config"));
      } finally {
        setLoading(false);
      }
    },
    [client],
  );
  useEffect(() => void reload(), [reload]);
  return { config, loading, error, reload };
}

export type HostedAuthButtonProps = {
  redirectUri: string;
  scopes?: string[];
  prompt?: "login";
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
};

export function HostedAuthButton({
  redirectUri,
  scopes,
  prompt,
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
      const started = await client.hostedAuth.start({ redirectUri, scopes, prompt });
      sessionStorage.setItem(
        transactionStorageKey(client.clientId),
        JSON.stringify(started.transaction),
      );
      window.location.assign(started.authorizationUrl);
    } finally {
      setStarting(false);
    }
  };
  return (
    <button
      type="button"
      className={className}
      style={{ ...styles.button, ...style }}
      disabled={disabled || starting || !redirectUri}
      onClick={() => void start()}
    >
      {children ?? (starting ? "Opening sign-in…" : "Sign in")}
    </button>
  );
}

export type SignInProps = HostedAuthButtonProps & {
  title?: string;
  description?: string;
  buttonLabel?: string;
  loadingLabel?: string;
  unavailableLabel?: string;
};

export function SignIn({
  title = "Sign in",
  description = "Continue with the sign-in methods enabled for this app.",
  buttonLabel = "Sign in",
  loadingLabel = "Loading sign-in…",
  unavailableLabel = "Sign-in is unavailable right now.",
  className,
  ...buttonProps
}: SignInProps) {
  const { config, loading, error } = useAuthConfig();
  const enabled = Boolean(config?.signin_methods.length);
  return (
    <section className={className} style={styles.card}>
      <div style={styles.header}>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.description}>{description}</p>
      </div>
      {loading ? <p style={styles.meta}>{loadingLabel}</p> : null}
      {error ? <p style={styles.error}>{error.message}</p> : null}
      {config ? (
        <p style={styles.meta}>
          {config.signin_methods.length} sign-in method
          {config.signin_methods.length === 1 ? "" : "s"} available
        </p>
      ) : null}
      <HostedAuthButton
        {...buttonProps}
        disabled={buttonProps.disabled || loading || Boolean(error) || !enabled}
      >
        {enabled ? buttonLabel : unavailableLabel}
      </HostedAuthButton>
    </section>
  );
}

export type CompletedHostedAuth = {
  tokens: NamoIDTokenResponse;
  identity: NamoIDUserInfo;
  idTokenClaims: ValidatedIDToken;
};

export async function completeHostedAuthRedirect(
  client: NamoIDClient,
  callbackUrl: string = window.location.href,
): Promise<CompletedHostedAuth> {
  const url = new URL(callbackUrl);
  const storageKey = transactionStorageKey(client.clientId);
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) {
    throw new NamoIDError("Authorization transaction is missing", {
      code: "missing_oidc_transaction",
    });
  }
  const transaction = JSON.parse(raw) as OIDCTransaction;
  const returnedState = url.searchParams.get("state");
  if (!returnedState || transaction.state !== returnedState) {
    throw new NamoIDError("Authorization state mismatch", { code: "invalid_oidc_state" });
  }
  const authError = url.searchParams.get("error");
  if (authError) {
    sessionStorage.removeItem(storageKey);
    throw new NamoIDError(url.searchParams.get("error_description") ?? authError, {
      code: authError,
    });
  }
  const code = url.searchParams.get("code");
  if (!code) {
    throw new NamoIDError("Authorization code is missing", {
      code: "missing_authorization_code",
    });
  }
  const discovery = await client.auth.getDiscovery();
  if (
    discovery.authorization_response_iss_parameter_supported &&
    url.searchParams.get("iss") !== discovery.issuer
  ) {
    throw new NamoIDError("Authorization response issuer mismatch", {
      code: "issuer_mismatch",
    });
  }
  const tokens = await client.hostedAuth.exchangeCode({
    code,
    redirectUri: transaction.redirectUri,
    codeVerifier: transaction.codeVerifier,
  });
  if (!tokens.id_token) {
    throw new NamoIDError("The token response did not include an ID token", {
      code: "missing_id_token",
    });
  }
  const idTokenClaims = await validateOIDCIdToken({
    idToken: tokens.id_token,
    discovery,
    clientId: client.clientId,
    nonce: transaction.nonce,
  });
  const identity = await client.hostedAuth.userInfo(tokens.access_token);
  if (identity.sub !== idTokenClaims.sub) {
    throw new NamoIDError("ID token and UserInfo subjects do not match", {
      code: "subject_mismatch",
    });
  }
  sessionStorage.removeItem(storageKey);
  return { tokens, identity, idTokenClaims };
}

function transactionStorageKey(clientId: string): string {
  return `namoid_oidc:${clientId.slice(-12)}`;
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
  header: { display: "grid", gap: 4 },
  title: { margin: 0, fontSize: 18, lineHeight: 1.2, fontWeight: 650 },
  description: { margin: 0, color: "#62645f", fontSize: 14, lineHeight: 1.45 },
  meta: { margin: 0, color: "#73756f", fontSize: 12 },
  error: { margin: 0, color: "#b42318", fontSize: 13 },
  button: {
    border: 0,
    borderRadius: 6,
    padding: "10px 14px",
    background: "#0d684f",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 650,
    cursor: "pointer",
  },
};
