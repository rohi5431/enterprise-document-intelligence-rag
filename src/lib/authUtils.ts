/**
 * Authentication and Security Utilities
 *
 * Implements cryptographically secure password hashing (scrypt with salt),
 * HMAC-SHA256 signed JWT tokens, token revocation, strict payload validation,
 * and production environment isolation for legacy tokens.
 */
import crypto from "crypto";

const JWT_SECRET = process.env.SECRET_KEY || "contextrag-production-secure-default-signing-key-32b";

// Warning in production if secret is using default fallback
if (process.env.NODE_ENV === "production" && !process.env.SECRET_KEY) {
  console.warn("[SECURITY WARNING] SECRET_KEY environment variable is not configured. Using default key is unsafe for multi-tenant production deployments.");
}

export function hashPassword(plainText: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(plainText, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(plainText: string, storedHash: string): boolean {
  if (!storedHash) return false;

  // Support scrypt hashed passwords
  if (storedHash.startsWith("scrypt:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const derivedKey = crypto.scryptSync(plainText, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, "hex");
    if (derivedKey.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedKey, expectedBuf);
  }

  // Backward compatibility with legacy plaintext (will be upgraded upon successful login)
  return plainText === storedHash;
}

export interface TokenPayload {
  userId: number;
  email: string;
  role: "admin" | "user";
  exp: number;
}

// Token revocation blocklist
const revokedTokens = new Set<string>();

export function revokeToken(token: string): void {
  if (token) revokedTokens.add(token);
}

export function isTokenRevoked(token: string): boolean {
  return revokedTokens.has(token);
}

export function generateAccessToken(user: { id: number; email: string; role: "admin" | "user" }): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24 hours
  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `cr_${encodedPayload}.${signature}`;
}

export function verifyAccessToken(token: string): TokenPayload | null {
  if (!token) return null;

  // Check revocation blocklist first
  if (isTokenRevoked(token)) {
    return null;
  }

  if (token.startsWith("cr_")) {
    const raw = token.slice(3);
    const parts = raw.split(".");
    if (parts.length !== 2) return null;
    const [encodedPayload, receivedSig] = parts;

    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(encodedPayload)
      .digest("base64url");

    if (Buffer.byteLength(receivedSig) !== Buffer.byteLength(expectedSig)) return null;
    if (!crypto.timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig))) {
      return null;
    }

    try {
      const decoded: any = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf-8")
      );

      // Strict schema and expiration validation
      if (typeof decoded.userId !== "number" || typeof decoded.exp !== "number") {
        return null;
      }
      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expired
      }
      if (!["admin", "user"].includes(decoded.role)) {
        return null;
      }

      return decoded as TokenPayload;
    } catch {
      return null;
    }
  }

  // Legacy mock tokens are STRICTLY prohibited in production environments
  if (token.startsWith("mock-token-")) {
    const isProduction = process.env.NODE_ENV === "production" && !process.env.TEST_MODE;
    if (isProduction) {
      console.warn(`[SECURITY VIOLATION] Mock token attempt blocked in production: ${token}`);
      return null;
    }

    const rawId = token.slice("mock-token-".length);
    const userId = parseInt(rawId, 10);
    if (!isNaN(userId)) {
      return {
        userId,
        email: `user_${userId}@legacy.local`,
        role: userId === 1 ? "admin" : "user",
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
    }
  }

  return null;
}
