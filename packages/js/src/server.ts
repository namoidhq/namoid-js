import { decodeProtectedHeader, importJWK, jwtVerify, type JWTPayload, type JWK } from "jose";

import { NamoIDError, type OIDCDiscoveryDocument } from "./index.js";

export * from "./management.js";

export type ValidatedIDToken = JWTPayload & {
  sub: string;
  nonce: string;
};

export async function validateOIDCIdToken(options: {
  idToken: string;
  discovery: OIDCDiscoveryDocument;
  clientId: string;
  nonce: string;
  fetcher?: typeof fetch;
}): Promise<ValidatedIDToken> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", {
      code: "missing_fetch",
    });
  }

  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(options.idToken);
  } catch (error) {
    throw invalidIdToken(error);
  }
  if (header.alg !== "RS256" || !header.kid) {
    throw new NamoIDError("ID token uses an unsupported signing key", {
      code: "invalid_id_token",
    });
  }

  const response = await fetcher(options.discovery.jwks_uri, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new NamoIDError(`Unable to load the issuer signing keys (${response.status})`, {
      status: response.status,
      code: "jwks_unavailable",
    });
  }
  const body = (await response.json()) as { keys?: JWK[] };
  const jwk = body.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    throw new NamoIDError("ID token signing key was not found", {
      code: "invalid_id_token",
    });
  }

  try {
    const key = await importJWK(jwk, "RS256");
    const { payload } = await jwtVerify(options.idToken, key, {
      algorithms: ["RS256"],
      issuer: options.discovery.issuer,
      audience: options.clientId,
      requiredClaims: ["sub", "iat", "exp", "nonce"],
    });
    if (payload.nonce !== options.nonce || typeof payload.sub !== "string") {
      throw new Error("nonce or subject mismatch");
    }
    return payload as ValidatedIDToken;
  } catch (error) {
    throw invalidIdToken(error);
  }
}

function invalidIdToken(error: unknown): NamoIDError {
  return new NamoIDError("ID token validation failed", {
    code: "invalid_id_token",
    detail: error instanceof Error ? error.message : undefined,
  });
}
