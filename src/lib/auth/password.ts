import { hash, verify } from "@node-rs/argon2";

// argon2id with OWASP-recommended baseline parameters.
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function validatePasswordStrength(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < 12) return "Password must be at least 12 characters.";
  if (pw.length > 256) return "Password is too long.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9\W_]/.test(pw)) return "Use a mix of letters and numbers or symbols.";
  return null;
}

export const hashPassword = (pw: string) => hash(pw, OPTS);

export async function verifyPassword(hashStr: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}
