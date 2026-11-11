/**
 * Deliverable proof: the contract stores the link to the work and its
 * keccak256 hash, so the recorded link cannot be changed after delivery.
 */
import { keccak256, toUtf8Bytes } from "ethers";

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
