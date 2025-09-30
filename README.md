# keeta-tools 🧰 (CLI)

A comprehensive TypeScript CLI for Keeta wallet management and network operations:
- Create/import wallets (including 24-word mnemonic support)
- Check balances with real token names and metadata
- Send tokens and manage token operations
- View transaction history and account information
- Create new tokens and manage supply
- Recovery operations for incomplete transactions

> Supports **Keeta testnet** and **mainnet** using the official `@keetanetwork/keetanet-client` SDK.
> Stores local keystore at `~/.keeta/wallet.json` by default.

## Quick start

```bash
# 1) Install dependencies
npm install

# 2) Build the CLI
npm run build

# 3) Install globally for system-wide access
npm install -g .

# 4) Generate a new wallet on testnet
keeta wallet:new --algo ed25519

# 5) Or import from 24-word mnemonic
keeta wallet:import --mnemonic "your 24 word mnemonic phrase here" --algo secp256k1 --index 0

# 6) Show your address
keeta wallet:address

# 7) Check all balances (shows real token names!)
keeta balance

# 8) View detailed token information
keeta tokens:list

# 9) Check account information
keeta info

# 10) View transaction history
keeta history --limit 10
```

## Wallet Management

```bash
# Create new wallet
keeta wallet:new [--algo ed25519|secp256k1|secp256r1]

# Import from 24-word mnemonic (auto-detects correct derivation)
keeta wallet:import --mnemonic "word1 word2 ... word24" [--algo ed25519] [--index 0]

# Import from hex seed
keeta wallet:import --seed 0x... [--algo ed25519]

# Import from private key (secp256k1 only)
keeta wallet:import --priv 0x...

# Show wallet address
keeta wallet:address

# Export seed/private key (DANGEROUS!)
keeta wallet:export

# Debug wallet derivations from mnemonic
keeta wallet:test-derivations --mnemonic "your 24 words"
```

## Balance & Token Operations

```bash
# Check all balances (shows token names like PRT, MURF, KEETA)
keeta balance

# Check specific token balance
keeta balance --token keeta_amlx64ui...

# Check another account's balance
keeta balance --address keeta_aabk5576...

# List all tokens with detailed information
keeta tokens:list

# Create a new token
keeta token:create
```

## Account Information

```bash
# Get comprehensive account information
keeta info

# View transaction history
keeta history [--limit 10]

# View block chain for account
keeta chain [--limit 10]

# Recover incomplete transactions
keeta recover
```

## Token Administration

```bash
# Send tokens
keeta send --token keeta_amlx64ui... --to keeta_aabk5576... --amount 1000

# Adjust token supply (requires TOKEN_ADMIN_SUPPLY permission)
keeta token:supply --token keeta_amlx64ui... --add 1000000
keeta token:supply --token keeta_amlx64ui... --sub 500000

# Mint and send tokens (requires admin permissions)
keeta token:mint --token keeta_amlx64ui... --to keeta_aabk5576... --amount 1000

# Burn tokens
keeta token:burn --token keeta_amlx64ui... --amount 500
keeta token:burn --token keeta_amlx64ui... --from keeta_aabk5576... --amount 500
```

## Network Configuration

```bash
# Use testnet (default)
keeta balance --network test

# Use mainnet
keeta balance --network main

# Set environment variable for persistent network choice
$env:KEETA_NETWORK = "main"    # PowerShell
export KEETA_NETWORK="main"   # Bash

# Custom keystore location
keeta balance --keyfile ./my-wallet.json
```

## Example Output

```bash
$ keeta balance
🔗 Connecting to network: test
📋 Querying account: keeta_aabk5576b6caozspu3ucwxdkn47wleefw7nk4kpziq4p6ijvl7wshn47hhiwmsy
💰 Balances:
  ZZZZ (keeta_am6ovq...): 1
  PRT (keeta_amlx64...): 9000000000000000000000
  DBH (keeta_aniwfc...): 10000000
  MURF (keeta_anvaw4...): 112610946
  KEETA (Base Token): 2490090104486200
  CULT (keeta_ap3piw...): 3010

💡 Use 'keeta tokens:list' for detailed token information
```

## Features

✅ **24-word mnemonic import** with auto-derivation testing  
✅ **Real token names** fetched from network metadata  
✅ **Multiple key algorithms** (ED25519, SECP256K1, SECP256R1)  
✅ **Transaction history** and block chain exploration  
✅ **Account recovery** for incomplete transactions  
✅ **Token creation** and comprehensive admin operations  
✅ **Network switching** between testnet and mainnet  
✅ **Rich CLI output** with emojis and formatted displays  

## Security Notes

- **Keystore security**: The CLI stores seeds in plaintext JSON. Use proper OS-level encryption or HSM for production use.
- **Network selection**: Always verify you're on the correct network (test/main) before transactions.
- **Mnemonic handling**: Be careful when entering mnemonic phrases in terminals - use private sessions.
- **Token permissions**: Admin operations require proper permissions on the token account.

## API Integration

Built on the official Keeta SDK:
- `UserClient.fromNetwork()` for network connections
- `Account.fromSeed()` and `Account.seedFromPassphrase()` for wallet operations
- `UserClientBuilder` for transaction construction
- `client.allBalances()` with real token metadata fetching
- `client.history()` and `client.chain()` for account exploration

## Troubleshooting

**Mnemonic import shows wrong address?**
```bash
# Test different derivation paths
keeta wallet:test-derivations --mnemonic "your 24 words"
# Then import with correct algorithm and index
keeta wallet:import --mnemonic "your 24 words" --algo secp256k1 --index 0
```

**Balance shows [object Object]?**
- This is resolved in the latest version - update and rebuild

**Can't see token names?**
- The CLI automatically fetches token names from the network
- Use `keeta tokens:list` for detailed token information

## Contributing

This tool serves as a reference implementation for Keeta network integration. It demonstrates:
- Proper use of the `@keetanetwork/keetanet-client` SDK
- Wallet management best practices
- Token metadata handling
- Network interaction patterns

