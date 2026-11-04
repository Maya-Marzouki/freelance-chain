/**
 * Off-chain data of an agreement.
 *
 * The contract only stores `termsHash` (keccak256 of the terms text). The text
 * itself, the description and the attachment name stay off-chain: here they are
 * kept in this browser's localStorage, indexed by that hash. A production app
 * would use IPFS or a database instead. The hash lets anyone verify that the
 * text shown is the one the parties agreed on.
 */
export interface AgreementMeta {
  description: string;
  terms: string;
  documentName?: string;
}

const KEY = "flc:agreement-meta:v1";

function readAll(): Record<string, AgreementMeta> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, AgreementMeta>;
  } catch {
    return {};
  }
}

export function saveMeta(termsHash: string, meta: AgreementMeta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [termsHash.toLowerCase()]: meta }));
  } catch {
    /* storage unavailable: the agreement still exists on-chain */
  }
}

export function loadMeta(termsHash: string): AgreementMeta | undefined {
  return readAll()[termsHash.toLowerCase()];
}
