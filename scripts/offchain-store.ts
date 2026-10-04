import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Address, Hex } from "viem";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const PYTHON = process.env.PYTHON ?? "python3";

//represents data returned from off-chain store
export interface OffchainData {
  dataHash: Hex;
  // the exact canonical JSON that dataHash is the SHA-256 of
  document: string;
  payload: unknown;
  storedAt: number;
}

//handles structured errors returned by Python off-chain CLI
export class OffchainError extends Error {
  constructor(
    public readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = "OffchainError";
  }
}

/**
 * Internal helper to run Python off-chain CLI module and parse
 * its JSON output. Captures and wraps and structured stderr errors.
 */
async function run<T>(storePath: string, args: string[]): Promise<T> {
  try {
    const { stdout } = await execFileAsync(
      PYTHON,
      ["-m", "offchain", "--store", storePath, ...args],
      { cwd: PROJECT_ROOT },
    );
    return JSON.parse(stdout) as T;
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim().startsWith("{")) {
      const { error: kind, message } = JSON.parse(stderr);
      throw new OffchainError(kind, message);
    }
    throw error;
  }
}

/**
 * Client for the simulated off-chain store in `offchain/` (run through
 * `python3 -m offchain`), backed by the file at `storePath`.
 */
export function offchainStore(storePath: string) {
  return {
    async storeData(owner: Address, device: Address, payload: unknown) {
      const { dataHash } = await run<{ dataHash: Hex }>(storePath, [
        "store",
        "--owner",
        owner,
        "--device",
        device,
        "--payload",
        JSON.stringify(payload),
      ]);
      return dataHash;
    },

    async dataHash(owner: Address, device: Address) {
      const { dataHash } = await run<{ dataHash: Hex }>(storePath, [
        "hash",
        "--owner",
        owner,
        "--device",
        device,
      ]);
      return dataHash;
    },

    // `granted` is the on-chain access decision for this requester
    readData(
      owner: Address,
      device: Address,
      requester: Address,
      granted: boolean,
    ) {
      return run<OffchainData>(storePath, [
        "read",
        "--owner",
        owner,
        "--device",
        device,
        "--requester",
        requester,
        "--granted",
        String(granted),
      ]);
    },

    async verify(dataHash: Hex) {
      const { valid } = await run<{ valid: boolean }>(storePath, [
        "verify",
        "--hash",
        dataHash,
      ]);
      return valid;
    },
  };
}
