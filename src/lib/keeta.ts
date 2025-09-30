import { homedir } from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  UserClient,
  lib
} from '@keetanetwork/keetanet-client';

const { Account } = lib;
const { AccountKeyAlgorithm } = Account;

export type NetworkName = 'test' | 'main';

export type Wallet = {
  seed?: string;            // hex (0x...); derived child index is `index`
  index?: number;           // default 0
  algo?: 'ed25519' | 'secp256k1' | 'secp256r1';
  privateKeySecp256k1?: string;  // alt import path
  address?: string;         // cached convenience
};

export function defaultKeyfile(): string {
  return path.join(homedir(), '.keeta', 'wallet.json');
}

export function ensureDir(p: string) {
  const dir = path.dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function saveWallet(w: Wallet, file?: string) {
  const f = file || defaultKeyfile();
  ensureDir(f);
  writeFileSync(f, JSON.stringify(w, null, 2), 'utf-8');
}

export function loadWallet(file?: string): Wallet | null {
  const f = file || defaultKeyfile();
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf-8'));
}

export function algoConst(name: string) {
  if (name === 'ed25519') return AccountKeyAlgorithm.ED25519;
  if (name === 'secp256k1') return AccountKeyAlgorithm.ECDSA_SECP256K1;
  if (name === 'secp256r1') return AccountKeyAlgorithm.ECDSA_SECP256R1;
  throw new Error(`Unknown algo: ${name}`);
}

export function accountFromWallet(wallet: any) {
  if (wallet.privateKeySecp256k1) {
    return Account.fromECDSASECP256K1PrivateKey(wallet.privateKeySecp256k1);
  }
  return Account.fromSeed(wallet.seed, wallet.index || 0, algoConst(wallet.algo || 'ed25519'));
}

export function clientFrom(network: string, account?: any) {
  return UserClient.fromNetwork(network as any, account || null);
}

export function asAccount(addr: string) {
  return Account.fromPublicKeyString(addr);
}
