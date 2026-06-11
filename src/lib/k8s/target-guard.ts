import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for the playground's server-side test calls. The BFF fetches
 * user-supplied gateway URLs by design (the browser can't reach private
 * addresses), but link-local targets — cloud metadata services like
 * 169.254.169.254 / metadata.google.internal — must never be reachable
 * through it. Loopback and RFC1918 stay allowed: port-forwards and private
 * LB addresses are the documented playground flow.
 */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 169 && b === 254;
  }
  const lower = ip.toLowerCase();
  // IPv6 link-local fe80::/10 (fe80–febf) and IPv4-mapped link-local.
  if (/^fe[89ab]/.test(lower)) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIp(mapped[1]);
  return false;
}

/** Throws when the target host is, or resolves to, a link-local address. */
export async function assertAllowedTarget(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      return; // unresolvable: the fetch will fail with its own clearer error
    }
  }
  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new Error(
        `target ${host} resolves to link-local address ${address} — blocked (cloud metadata endpoints are not reachable through the playground)`,
      );
    }
  }
}
