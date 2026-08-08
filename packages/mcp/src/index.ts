/**
 * NamoID authorization for a customer-owned MCP server.
 *
 * NamoID is the authorization server. Your MCP server is the protected
 * resource. An MCP host — Claude, ChatGPT, Cursor, VS Code — is the OAuth
 * client, and the signed-in human is the resource owner.
 *
 * This package covers only the protected-resource side: RFC 9728 metadata,
 * audience-bound token verification, and per-tool scope enforcement. It needs
 * no NamoID credentials, because a resource server only consumes public
 * discovery metadata and JWKS.
 *
 * It is deliberately framework-agnostic. Nothing here imports Express, so it
 * works with the MCP SDK's Express middleware, its web-standard transport,
 * Hono, or Fastify. Publishing the metadata document and mounting the bearer
 * challenge stay with the application.
 */

import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  OAuthMetadataSchema,
  type OAuthMetadata,
  type OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/** NamoID signs every environment's tokens with RS256. Nothing else is accepted. */
const ALLOWED_ALGORITHMS = ["RS256"] as const;

/** Discovery must not hang server startup behind an unreachable issuer. */
const DEFAULT_DISCOVERY_TIMEOUT_MS = 5_000;

/** Allowed clock skew when checking `exp` and `nbf`. */
const DEFAULT_CLOCK_TOLERANCE_SECONDS = 30;

/** Raised when configuration or discovery is wrong, always at startup. */
export class NamoIDMcpConfigurationError extends Error {
  override readonly name = "NamoIDMcpConfigurationError";
}

export interface NamoIDMcpAuthOptions {
  /**
   * The NamoID environment issuer, for example
   * `https://acme-test.id.namoid.in`. Copy it from **MCP Authorization ->
   * Integration details -> Authorization server** in the Console. Test and Live
   * are separate issuers.
   */
  issuer: string;
  /**
   * The canonical public URL of your MCP server, exactly as registered as the
   * resource audience in NamoID, for example `https://mcp.acme.example/mcp`.
   * Tokens carry this string in `aud`, so any difference — a trailing slash, a
   * different host, http vs https — rejects every token.
   */
  resource: string;
  /** Human-readable name shown to users during discovery and consent. */
  resourceName?: string;
  /**
   * Scopes advertised for an ordinary first connection. Keep this minimal:
   * sensitive write scopes should be requested incrementally rather than
   * bundled into the first consent screen.
   */
  scopesSupported: string[];
  /** Documentation URL to advertise in the metadata document. */
  resourceDocumentation?: string;
  /** Allowed clock skew in seconds when checking `exp`/`nbf`. Defaults to 30. */
  clockToleranceSeconds?: number;
  /** Timeout in milliseconds for the startup discovery fetch. Defaults to 5000. */
  discoveryTimeoutMs?: number;
  /** Replaces `globalThis.fetch`, mainly for tests. */
  fetcher?: typeof fetch;
}

export interface NamoIDMcpAuth {
  /** NamoID's authorization-server metadata, fetched once at startup. */
  authorizationServer: OAuthMetadata;
  /** The RFC 9728 document your server must publish. */
  protectedResourceMetadata: OAuthProtectedResourceMetadata;
  /**
   * Path to publish that document on, derived from the resource URL. A resource
   * at `https://mcp.acme.example/mcp` publishes at
   * `/.well-known/oauth-protected-resource/mcp`.
   */
  protectedResourceMetadataPath: string;
  /** Absolute URL of the document, for `WWW-Authenticate` challenges. */
  protectedResourceMetadataUrl: string;
  /** Token verifier for the MCP SDK's `requireBearerAuth` middleware. */
  verifier: OAuthTokenVerifier;
}

/** Immutable identity of the caller behind a single tool invocation. */
export interface McpCaller {
  /** NamoID user ID (`sub`) — the human who consented, never the MCP host. */
  subject: string;
  /** The OAuth client: a preregistered Client ID or a CIMD document URL. */
  clientId: string;
  /** Scopes actually granted, not the scopes the client requested. */
  scopes: ReadonlySet<string>;
  tenantId?: string;
  projectId?: string;
  environmentId?: string;
  /** Token identifier (`jti`), useful for correlating your own audit records. */
  tokenId?: string;
}

/**
 * Verify NamoID discovery, build a token verifier, and derive the RFC 9728
 * metadata your server has to publish.
 *
 * Call once at startup so a wrong issuer or resource URL fails immediately with
 * a readable message instead of as an opaque 401 on the first tool call.
 *
 * @throws {NamoIDMcpConfigurationError} If the issuer or resource URL is
 * unusable, the issuer is unreachable, or its metadata describes a different
 * issuer.
 */
export async function createNamoIDMcpAuth(
  options: NamoIDMcpAuthOptions,
): Promise<NamoIDMcpAuth> {
  const issuer = assertIssuer(options.issuer);
  const resource = assertResource(options.resource);
  const clockTolerance = options.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS;

  const { metadata, jwksUri } = await discoverAuthorizationServer(issuer, {
    timeoutMs: options.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS,
    fetcher: options.fetcher,
  });
  const jwks = createRemoteJWKSet(new URL(jwksUri));

  const protectedResourceMetadata: OAuthProtectedResourceMetadata = {
    resource: resource.href,
    // `metadata.issuer` is the issuer's own spelling of itself. Publishing that
    // exact string keeps RFC 8414's exact-match issuer comparison working for
    // clients that follow this document back to the authorization server.
    authorization_servers: [metadata.issuer],
    scopes_supported: [...options.scopesSupported],
    bearer_methods_supported: ["header"],
    ...(options.resourceName === undefined ? {} : { resource_name: options.resourceName }),
    ...(options.resourceDocumentation === undefined
      ? {}
      : { resource_documentation: options.resourceDocumentation }),
  };

  const metadataPath = protectedResourceMetadataPath(resource);

  return {
    authorizationServer: metadata,
    protectedResourceMetadata,
    protectedResourceMetadataPath: metadataPath,
    protectedResourceMetadataUrl: new URL(metadataPath, resource).href,
    verifier: {
      async verifyAccessToken(token: string): Promise<AuthInfo> {
        return verifyAccessToken(token, {
          jwks,
          issuer,
          resource,
          clockTolerance,
        });
      },
    },
  };
}

/**
 * Derive the RFC 9728 metadata path for a resource URL.
 *
 * The well-known segment goes between the authority and the resource path, so
 * `https://mcp.acme.example/mcp` publishes at
 * `/.well-known/oauth-protected-resource/mcp`.
 */
export function protectedResourceMetadataPath(resource: string | URL): string {
  const { pathname } = resource instanceof URL ? resource : new URL(resource);
  const suffix = pathname === "/" ? "" : pathname.replace(/\/+$/, "");
  return `/.well-known/oauth-protected-resource${suffix}`;
}

/**
 * Wrap a tool handler so it runs only when the caller's token carries every
 * required scope.
 *
 * A scope is permission to *attempt* an action. Business rules — ownership,
 * organization boundaries, transaction limits — still belong inside `handler`.
 * A token with `refunds:create` does not mean the user may refund another
 * organization's invoice.
 */
export function requireScopes<Args>(
  auth: NamoIDMcpAuth,
  requiredScopes: readonly string[],
  handler: (args: Args, caller: McpCaller) => Promise<CallToolResult>,
): (args: Args, extra: { authInfo?: AuthInfo }) => Promise<CallToolResult> {
  return async (args, extra) => {
    const caller = callerFromAuthInfo(extra.authInfo);
    if (caller === null) {
      // Unreachable behind requireBearerAuth. Kept so mounting this handler on
      // an unauthenticated route fails closed rather than open.
      return insufficientScopeResult(auth, requiredScopes, []);
    }

    const missing = requiredScopes.filter((scope) => !caller.scopes.has(scope));
    if (missing.length > 0) {
      return insufficientScopeResult(auth, missing, [...caller.scopes]);
    }

    return handler(args, caller);
  };
}

/** Build an {@link McpCaller} from verified token info, or `null` if absent. */
export function callerFromAuthInfo(authInfo: AuthInfo | undefined): McpCaller | null {
  if (!authInfo) return null;
  const extra = authInfo.extra ?? {};
  const claim = (key: string): string | undefined =>
    typeof extra[key] === "string" && extra[key] ? (extra[key] as string) : undefined;
  return {
    subject: claim("subject") ?? "",
    clientId: authInfo.clientId,
    scopes: new Set(authInfo.scopes),
    ...(claim("tenantId") === undefined ? {} : { tenantId: claim("tenantId") }),
    ...(claim("projectId") === undefined ? {} : { projectId: claim("projectId") }),
    ...(claim("environmentId") === undefined ? {} : { environmentId: claim("environmentId") }),
    ...(claim("tokenId") === undefined ? {} : { tokenId: claim("tokenId") }),
  };
}

/**
 * Tell the host which scopes are missing so it can start incremental
 * authorization instead of giving up.
 *
 * The HTTP `403` + `WWW-Authenticate` challenge applies to the whole endpoint.
 * A single tool that needs an elevated scope has to answer inside the JSON-RPC
 * response, so the same `insufficient_scope` code and `resource_metadata`
 * pointer travel in structured content.
 */
function insufficientScopeResult(
  auth: NamoIDMcpAuth,
  missingScopes: readonly string[],
  grantedScopes: readonly string[],
): CallToolResult {
  const scopeList = missingScopes.join(" ");
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `This action needs additional authorization. Missing scope(s): ${scopeList}. ` +
          "Reconnect and approve the additional access to continue.",
      },
    ],
    structuredContent: {
      error: "insufficient_scope",
      required_scopes: [...missingScopes],
      granted_scopes: [...grantedScopes],
      resource: auth.protectedResourceMetadata.resource,
      resource_metadata: auth.protectedResourceMetadataUrl,
      www_authenticate:
        `Bearer error="insufficient_scope", scope="${scopeList}", ` +
        `resource_metadata="${auth.protectedResourceMetadataUrl}"`,
    },
  };
}

async function verifyAccessToken(
  token: string,
  context: {
    jwks: ReturnType<typeof createRemoteJWKSet>;
    issuer: string;
    resource: URL;
    clockTolerance: number;
  },
): Promise<AuthInfo> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, context.jwks, {
      issuer: context.issuer,
      audience: context.resource.href,
      algorithms: [...ALLOWED_ALGORITHMS],
      clockTolerance: context.clockTolerance,
    }));
  } catch (error) {
    // Never echo the token or a stack trace back to the client.
    throw new InvalidTokenError(describeVerificationFailure(error));
  }

  // An ID token is not an API token. NamoID stamps `token_use` so a resource
  // server can tell them apart even though both are RS256 JWTs from the same
  // issuer carrying the same `iss`.
  if (payload.token_use !== "access") {
    throw new InvalidTokenError("token is not an access token");
  }

  const subject = requiredStringClaim(payload, "sub");
  const clientId = requiredStringClaim(payload, "client_id");
  if (typeof payload.exp !== "number") {
    throw new InvalidTokenError("token has no expiration time");
  }

  return {
    token,
    clientId,
    scopes: parseScopes(payload.scope),
    expiresAt: payload.exp,
    resource: context.resource,
    extra: {
      subject,
      tenantId: optionalStringClaim(payload, "tid"),
      projectId: optionalStringClaim(payload, "pid"),
      environmentId: optionalStringClaim(payload, "eid"),
      tokenId: optionalStringClaim(payload, "jti"),
    },
  };
}

async function discoverAuthorizationServer(
  issuer: string,
  options: { timeoutMs: number; fetcher?: typeof fetch },
): Promise<{ metadata: OAuthMetadata; jwksUri: string }> {
  const discoveryUrl = new URL("/.well-known/oauth-authorization-server", `${issuer}/`);
  const document = await fetchJson(discoveryUrl, options);

  const parsed = OAuthMetadataSchema.safeParse(document);
  if (!parsed.success) {
    throw new NamoIDMcpConfigurationError(
      `${discoveryUrl.href} is not valid OAuth authorization-server metadata`,
    );
  }

  // RFC 9700 mix-up defence: the document must claim the issuer we asked for.
  if (parsed.data.issuer !== issuer) {
    throw new NamoIDMcpConfigurationError(
      `issuer mismatch: expected ${issuer} but ${discoveryUrl.href} declares ${parsed.data.issuer}`,
    );
  }

  // `jwks_uri` is required by RFC 8414 but sits outside the MCP SDK's typed
  // subset, so it is validated here rather than trusted from an index access.
  const jwksUri = (document as Record<string, unknown>)["jwks_uri"];
  if (typeof jwksUri !== "string" || !jwksUri) {
    throw new NamoIDMcpConfigurationError(`${discoveryUrl.href} does not advertise a jwks_uri`);
  }

  return { metadata: parsed.data, jwksUri };
}

async function fetchJson(
  url: URL,
  options: { timeoutMs: number; fetcher?: typeof fetch },
): Promise<unknown> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    throw new NamoIDMcpConfigurationError("fetch is not available; pass a fetcher option");
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    throw new NamoIDMcpConfigurationError(
      `could not reach ${url.href}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  if (!response.ok) {
    throw new NamoIDMcpConfigurationError(`${url.href} returned HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new NamoIDMcpConfigurationError(`${url.href} did not return JSON`);
  }
}

function assertIssuer(value: string): string {
  const issuer = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new NamoIDMcpConfigurationError(
      `issuer must be an absolute URL, received "${value}"`,
    );
  }
  if (url.search || url.hash) {
    throw new NamoIDMcpConfigurationError("issuer must not contain a query string or fragment");
  }
  if (url.protocol !== "https:" && !isLocalHostname(url.hostname)) {
    throw new NamoIDMcpConfigurationError("issuer must use https outside local development");
  }
  return issuer;
}

function assertResource(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new NamoIDMcpConfigurationError(
      `resource must be an absolute URL, received "${value}"`,
    );
  }
  if (url.hash) {
    // RFC 8707 resource indicators carry no fragment, and `aud` is compared as
    // an exact string.
    throw new NamoIDMcpConfigurationError("resource must not contain a fragment");
  }
  if (url.protocol !== "https:" && !isLocalHostname(url.hostname)) {
    throw new NamoIDMcpConfigurationError("resource must use https outside local development");
  }
  return url;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function parseScopes(scope: unknown): string[] {
  if (typeof scope !== "string") return [];
  return scope.split(/\s+/).filter(Boolean);
}

function requiredStringClaim(payload: JWTPayload, claim: string): string {
  const value = payload[claim];
  if (typeof value !== "string" || !value) {
    throw new InvalidTokenError(`token is missing the ${claim} claim`);
  }
  return value;
}

function optionalStringClaim(payload: JWTPayload, claim: string): string | undefined {
  const value = payload[claim];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Map a verification failure to a short, non-revealing reason. `jose` sets a
 * stable `code` on its errors; anything else collapses to a generic message.
 */
function describeVerificationFailure(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  switch (code) {
    case "ERR_JWT_EXPIRED":
      return "token has expired";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      return "token issuer or audience does not match this MCP server";
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
      return "token signature could not be verified";
    case "ERR_JWKS_NO_MATCHING_KEY":
      return "token was signed with an unknown key";
    case "ERR_JOSE_ALG_NOT_ALLOWED":
      return "token uses an unsupported signing algorithm";
    default:
      return "token could not be verified";
  }
}
