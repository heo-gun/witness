import { readFileSync } from "node:fs";
import { hexToBytes } from "@tlog/shared";

export interface RootVector {
  treeSize: number;
  rootHash: string;
}
export interface InclusionVector {
  treeSize: number;
  leafIndex: number;
  proof: string[];
}
export interface ConsistencyVector {
  first: number;
  second: number;
  proof: string[];
}

function jsonLines<T>(name: string): T[] {
  return readFileSync(new URL(`./vectors/${name}.jsonl`, import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as T);
}

const entryHex = JSON.parse(
  readFileSync(new URL("./vectors/entries.json", import.meta.url), "utf8"),
) as string[];
export const entries = entryHex.map((hex) => hexToBytes(hex));
export const roots = jsonLines<RootVector>("roots");
export const inclusions = jsonLines<InclusionVector>("inclusion");
export const consistencies = jsonLines<ConsistencyVector>("consistency");
export const rootBySize = new Map(
  roots.map(({ treeSize, rootHash }) => [treeSize, hexToBytes(rootHash, 32)]),
);

export function expectedRoot(treeSize: number): Uint8Array<ArrayBuffer> {
  const root = rootBySize.get(treeSize);
  if (!root) throw new Error(`Missing root vector for tree size ${treeSize}`);
  return root;
}
