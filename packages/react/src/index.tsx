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
  type PopupAuthorizationResult,
} from "@namoidhq/js";
import { validateOIDCIdToken, type ValidatedIDToken } from "@namoidhq/js/server";
import {
  createContext,
  useCallback,
  type CSSProperties,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
      await startHostedAuthRedirect(client, { redirectUri, scopes, prompt });
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

export type NamoIDSignInStatus =
  | "idle"
  | "loading"
  | "opening"
  | "completing"
  | "redirecting"
  | "complete"
  | "error";

export type UseNamoIDSignInOptions = {
  redirectUri: string;
  scopes?: string[];
  prompt?: "login";
  timeoutMs?: number;
  fallback?: "redirect" | "none";
  onComplete: (result: CompletedHostedAuth) => void | Promise<void>;
  onError?: (error: Error) => void;
};

export type UseNamoIDSignInState = {
  config: NamoIDAuthConfig | null;
  status: NamoIDSignInStatus;
  error: Error | null;
  ready: boolean;
  signIn: () => Promise<void>;
  reset: () => void;
};

/**
 * Headless controller for the popup-first Hosted Auth experience.
 * Credentials, social providers, MFA, and consent stay on NamoID Hosted Auth.
 */
export function useNamoIDSignIn({
  redirectUri,
  scopes,
  prompt,
  timeoutMs,
  fallback = "redirect",
  onComplete,
  onError,
}: UseNamoIDSignInOptions): UseNamoIDSignInState {
  const client = useNamoID();
  const { config, loading, error: configError } = useAuthConfig();
  const [status, setStatus] = useState<NamoIDSignInStatus>("idle");
  const [flowError, setFlowError] = useState<Error | null>(null);
  const ready = Boolean(
    !loading &&
      !configError &&
      redirectUri &&
      config?.signin_methods.length &&
      config.login_delivery_modes.includes("popup"),
  );
  const reset = useCallback(() => {
    setFlowError(null);
    setStatus("idle");
  }, []);
  const signIn = useCallback(async () => {
    if (!ready) return;
    setFlowError(null);
    setStatus("opening");
    try {
      const authorization = await client.hostedAuth.popup({
        redirectUri,
        scopes,
        prompt,
        timeoutMs,
      });
      setStatus("completing");
      const completed = await completeHostedAuthPopup(client, authorization);
      await onComplete(completed);
      setStatus("complete");
    } catch (value) {
      const error = value instanceof Error ? value : new Error("Sign-in failed");
      if (
        fallback === "redirect" &&
        error instanceof NamoIDError &&
        error.code === "popup_blocked"
      ) {
        setStatus("redirecting");
        try {
          await startHostedAuthRedirect(client, { redirectUri, scopes, prompt });
        } catch (redirectValue) {
          const redirectError =
            redirectValue instanceof Error
              ? redirectValue
              : new Error("Sign-in redirect failed");
          setFlowError(redirectError);
          setStatus("error");
          onError?.(redirectError);
        }
        return;
      }
      setFlowError(error);
      setStatus("error");
      onError?.(error);
    }
  }, [client, fallback, onComplete, onError, prompt, ready, redirectUri, scopes, timeoutMs]);

  return {
    config,
    status: loading ? "loading" : status,
    error: configError ?? flowError,
    ready,
    signIn,
    reset,
  };
}

export type NamoIDSignInAppearance = {
  theme?: "light" | "dark" | "auto";
  accent?: string;
  radius?: string | number;
  fontFamily?: string;
};

export type NamoIDSignInProps = UseNamoIDSignInOptions & {
  title?: string;
  description?: string;
  buttonLabel?: string;
  className?: string;
  style?: CSSProperties;
  appearance?: NamoIDSignInAppearance;
};

export function NamoIDSignIn({
  title = "Sign in",
  description = "Continue securely with the sign-in methods configured for this application.",
  buttonLabel = "Continue",
  className,
  style,
  appearance,
  ...options
}: NamoIDSignInProps) {
  const auth = useNamoIDSignIn(options);
  const accent = appearance?.accent ?? auth.config?.brand_primary_color ?? "#0d684f";
  const radius = appearance?.radius ?? 14;
  const dark = useDarkAppearance(appearance?.theme, auth.config?.brand_dark_mode ?? false);
  const colors = dark
    ? {
        surface: "#101814",
        foreground: "#f7f8f6",
        muted: "#aab5af",
        border: "#33433b",
        errorSurface: "#321a18",
        errorBorder: "#85453e",
        errorText: "#ffb4aa",
      }
    : {
        surface: "#ffffff",
        foreground: "#111111",
        muted: "#62645f",
        border: "#deded8",
        errorSurface: "#fff4f2",
        errorBorder: "#f0b4ae",
        errorText: "#8f1d14",
      };
  const statusLabel = signInStatusLabel(auth.status);
  const interactive = auth.ready && ["idle", "error"].includes(auth.status);
  return (
    <section
      className={className}
      aria-busy={["loading", "opening", "completing", "redirecting"].includes(auth.status)}
      style={{
        ...styles.signInSurface,
        borderRadius: radius,
        fontFamily: appearance?.fontFamily,
        background: colors.surface,
        color: colors.foreground,
        borderColor: colors.border,
        ...style,
      }}
    >
      {auth.config?.brand_logo_url ? (
        <img src={auth.config.brand_logo_url} alt="" style={styles.brandLogo} />
      ) : null}
      <div style={styles.header}>
        <h2 style={styles.signInTitle}>{title}</h2>
        <p style={{ ...styles.description, color: colors.muted }}>{description}</p>
      </div>
      {auth.error ? (
        <div
          role="alert"
          style={{
            ...styles.errorBox,
            background: colors.errorSurface,
            borderColor: colors.errorBorder,
          }}
        >
          <p style={{ ...styles.error, color: colors.errorText }}>
            {safeSignInError(auth.error)}
          </p>
          <button
            type="button"
            onClick={auth.reset}
            style={{ ...styles.retryButton, color: colors.errorText }}
          >
            Try again
          </button>
        </div>
      ) : null}
      <button
        type="button"
        disabled={!interactive}
        onClick={() => void auth.signIn()}
        style={{
          ...styles.button,
          background: accent,
          color: readableTextColor(accent),
          cursor: interactive ? "pointer" : "not-allowed",
          opacity: interactive ? 1 : 0.62,
        }}
      >
        {statusLabel ?? buttonLabel}
      </button>
      <p style={{ ...styles.securedBy, color: colors.muted }}>Secured by NamoID</p>
    </section>
  );
}

export type NamoIDSignInModalProps = NamoIDSignInProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NamoIDSignInModal({
  open,
  onOpenChange,
  ...signInProps
}: NamoIDSignInModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      aria-label={signInProps.title ?? "Sign in"}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      style={styles.dialog}
    >
      <button
        type="button"
        aria-label="Close sign-in"
        onClick={() => onOpenChange(false)}
        style={styles.closeButton}
      >
        ×
      </button>
      <NamoIDSignIn {...signInProps} style={{ border: 0, boxShadow: "none", ...signInProps.style }} />
    </dialog>
  );
}

export type HostedAuthPopupButtonProps = HostedAuthButtonProps & {
  timeoutMs?: number;
  onSuccess: (result: CompletedHostedAuth) => void | Promise<void>;
  onError?: (error: Error) => void;
};

export function HostedAuthPopupButton({
  redirectUri,
  scopes,
  prompt,
  timeoutMs,
  onSuccess,
  onError,
  children,
  className,
  style,
  disabled,
}: HostedAuthPopupButtonProps) {
  const client = useNamoID();
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    try {
      const authorization = await client.hostedAuth.popup({
        redirectUri,
        scopes,
        prompt,
        timeoutMs,
      });
      await onSuccess(await completeHostedAuthPopup(client, authorization));
    } catch (value) {
      const error = value instanceof Error ? value : new Error("Popup sign-in failed");
      if (onError) onError(error);
      else throw error;
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
  const completed = await completeAuthorizationCode(client, transaction, code);
  sessionStorage.removeItem(storageKey);
  return completed;
}

export async function completeHostedAuthPopup(
  client: NamoIDClient,
  result: PopupAuthorizationResult,
): Promise<CompletedHostedAuth> {
  const discovery = await client.auth.getDiscovery();
  if (result.issuer !== discovery.issuer) {
    throw new NamoIDError("Authorization response issuer mismatch", {
      code: "issuer_mismatch",
    });
  }
  return completeAuthorizationCode(client, result.transaction, result.code);
}

async function completeAuthorizationCode(
  client: NamoIDClient,
  transaction: OIDCTransaction,
  code: string,
): Promise<CompletedHostedAuth> {
  const discovery = await client.auth.getDiscovery();
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
  return { tokens, identity, idTokenClaims };
}

function transactionStorageKey(clientId: string): string {
  return `namoid_oidc:${clientId.slice(-12)}`;
}

async function startHostedAuthRedirect(
  client: NamoIDClient,
  options: Pick<HostedAuthButtonProps, "redirectUri" | "scopes" | "prompt">,
): Promise<void> {
  const started = await client.hostedAuth.start(options);
  sessionStorage.setItem(
    transactionStorageKey(client.clientId),
    JSON.stringify(started.transaction),
  );
  window.location.assign(started.authorizationUrl);
}

function signInStatusLabel(status: NamoIDSignInStatus): string | null {
  if (status === "loading") return "Loading sign-in…";
  if (status === "opening") return "Opening secure sign-in…";
  if (status === "completing") return "Completing sign-in…";
  if (status === "redirecting") return "Redirecting to sign-in…";
  if (status === "complete") return "Signed in";
  return null;
}

function safeSignInError(error: Error): string {
  if (error instanceof NamoIDError && error.code === "popup_closed") {
    return "The sign-in window was closed before completion.";
  }
  if (error instanceof NamoIDError && error.code === "popup_timeout") {
    return "The sign-in window took too long. Please try again.";
  }
  if (error instanceof NamoIDError && error.code === "access_denied") {
    return "Sign-in was cancelled.";
  }
  return "Sign-in could not be completed. Please try again.";
}

function useDarkAppearance(
  theme: NamoIDSignInAppearance["theme"],
  configuredDark: boolean,
): boolean {
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    if (theme !== "auto" || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [theme]);
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (theme === "auto") return systemDark;
  return configuredDark;
}

function readableTextColor(color: string): "#111111" | "#ffffff" {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1]!, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const toLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= darkContrast ? "#ffffff" : "#111111";
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
  errorBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid #f0b4ae",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#fff4f2",
  },
  retryButton: {
    border: 0,
    padding: 0,
    background: "transparent",
    color: "#8f1d14",
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer",
  },
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
  signInSurface: {
    width: "min(100%, 420px)",
    boxSizing: "border-box",
    border: "1px solid #deded8",
    padding: 24,
    background: "#ffffff",
    color: "#111111",
    display: "grid",
    gap: 18,
    boxShadow: "0 20px 55px rgba(17, 24, 21, 0.12)",
  },
  signInTitle: { margin: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 700 },
  brandLogo: { display: "block", width: 44, height: 44, objectFit: "contain" },
  securedBy: {
    margin: 0,
    color: "#73756f",
    fontSize: 12,
    textAlign: "center",
  },
  dialog: {
    position: "relative",
    width: "min(calc(100% - 32px), 468px)",
    maxWidth: 468,
    margin: "auto",
    padding: 0,
    border: 0,
    borderRadius: 16,
    background: "transparent",
    overflow: "visible",
  },
  closeButton: {
    position: "absolute",
    zIndex: 1,
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    border: "1px solid #deded8",
    borderRadius: 999,
    background: "#ffffff",
    color: "#3f423d",
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
  },
};
