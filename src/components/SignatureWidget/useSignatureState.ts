import { useState } from "react";

export type SignatureState = "closed" | "open" | "confirming" | "confirmed";

export function useSignatureState(): [
  SignatureState,
  (s: SignatureState) => void
] {
  const [state, setState] = useState<SignatureState>("closed");
  return [state, setState];
}
