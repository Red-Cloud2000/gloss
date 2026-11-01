import type { ReactNode } from "react";

/** Anonymous desktop use. Sign-in on the live site is Clerk; here the button stays, and the library lives on this machine. */

const anon = { user: null, isSignedIn: false, isLoaded: true, userId: null };

export function useUser() {
  return anon;
}

export function useAuth() {
  return anon;
}

export function Show({ when, children }: { when?: string; children?: ReactNode }) {
  if (when === "signed-in") return null;
  return <>{children}</>;
}

export function SignInButton({ children }: { children?: ReactNode; mode?: string }) {
  return <>{children}</>;
}

export function UserButton() {
  return null;
}

export function ClerkProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
