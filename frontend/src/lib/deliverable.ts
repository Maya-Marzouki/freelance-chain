/**
 * Deliverable proof, same idea as `termsHash`: the file stays off-chain, the
 * contract stores its keccak256 hash and a link to it.
 */
import { keccak256, toUtf8Bytes } from "ethers";

/** keccak256 of a file's bytes, computed in the browser (the file is never uploaded). */
export async function hashFile(file: File): Promise<string> {
  return keccak256(new Uint8Array(await file.arrayBuffer()));
}

/** Fallback when no file is attached: the hash only proves the link itself. */
export function hashLink(uri: string): string {
  return keccak256(toUtf8Bytes(uri.trim()));
}

export function isValidLink(uri: string): boolean {
  try {
    const url = new URL(uri.trim());
    return ["http:", "https:", "ipfs:"].includes(url.protocol);
  } catch {
    return false;
  }
}
