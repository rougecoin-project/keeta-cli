#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  defaultKeyfile, loadWallet, saveWallet, accountFromWallet,
  clientFrom, algoConst, asAccount
} from './lib/keeta.js';

import {
  lib
} from '@keetanetwork/keetanet-client';

const { Account } = lib;
const { AccountKeyAlgorithm } = Account;

const program = new Command();
program
  .name('keeta')
  .description('Keeta wallet CLI (unofficial sample)')
  .version('0.1.0');

function networkOpt(cmd: Command) {
  return cmd.option('--network <name>', 'test | main', process.env.KEETA_NETWORK || 'test');
}
function keyfileOpt(cmd: Command) {
  return cmd.option('--keyfile <path>', 'path to keystore (default ~/.keeta/wallet.json)');
}
function getKeyfile(opts: any) {
  return opts.keyfile ? resolve(opts.keyfile) : (process.env.KEETA_KEYFILE || defaultKeyfile());
}

program
  .command('wallet:new')
  .description('Create a new wallet (stores seed locally)')
  .option('--algo <name>', 'ed25519 | secp256k1 | secp256r1', 'ed25519')
  .action(async (opts) => {
    const seed = Account.generateRandomSeed({ asString: true });
    const wallet = { seed, index: 0, algo: opts.algo };
    saveWallet(wallet, getKeyfile(opts));
    const acct = Account.fromSeed(seed, 0, algoConst(opts.algo));
    console.log('✅ Wallet created');
    console.log('Address:', acct.publicKeyString.toString());
  });

program
  .command('wallet:import')
  .description('Import a wallet from seed, mnemonic, or secp256k1 private key')
  .option('--seed <hex>', 'hex seed 0x...')
  .option('--mnemonic <words>', '24 word mnemonic phrase (quoted)')
  .option('--algo <name>', 'ed25519 | secp256k1 | secp256r1', 'ed25519')
  .option('--index <n>', 'derivation index (default: 0)', '0')
  .option('--priv <hex>', 'secp256k1 private key 0x...')
  .action(async (opts) => {
    if (!opts.seed && !opts.priv && !opts.mnemonic) {
      console.error('Provide --seed 0x..., --mnemonic "word1 word2...", or --priv 0x...');
      process.exit(1);
    }
    let wallet: any = {};
    let acct;
    
    if (opts.priv) {
      wallet.privateKeySecp256k1 = opts.priv;
      acct = Account.fromECDSASECP256K1PrivateKey(opts.priv);
    } else if (opts.mnemonic) {
      // Convert 24-word mnemonic to seed using Keeta's seedFromPassphrase
      const seed = await Account.seedFromPassphrase(opts.mnemonic, { asString: true });
      wallet.seed = seed;
      wallet.algo = opts.algo;
      wallet.index = parseInt(opts.index);
      acct = Account.fromSeed(seed, parseInt(opts.index), algoConst(opts.algo));
    } else {
      wallet.seed = opts.seed;
      wallet.algo = opts.algo;
      wallet.index = parseInt(opts.index);
      acct = Account.fromSeed(opts.seed, parseInt(opts.index), algoConst(opts.algo));
    }
    
    saveWallet(wallet, getKeyfile(opts));
    console.log('✅ Wallet imported');
    console.log('Algorithm:', opts.algo);
    console.log('Index:', wallet.index);
    console.log('Address:', acct.publicKeyString.toString());
  });

program
  .command('wallet:address')
  .description('Show the wallet address')
  .action(() => {
    const wallet = loadWallet();
    if (!wallet) {
      console.error('No wallet found. Run: keeta wallet:new');
      process.exit(1);
    }
    const acct = accountFromWallet(wallet);
    console.log(acct.publicKeyString.toString());
  });

program
  .command('wallet:export')
  .description('Show seed/private key (DANGEROUS)')
  .action(() => {
    const wallet = loadWallet();
    if (!wallet) {
      console.error('No wallet found.');
      process.exit(1);
    }
    if (wallet.privateKeySecp256k1) {
      console.log('secp256k1 private key:', wallet.privateKeySecp256k1);
    } else {
      console.log('seed:', wallet.seed);
      console.log('algo:', wallet.algo || 'secp256k1');
      console.log('index:', wallet.index ?? 0);
    }
  });

keyfileOpt(
program
  .command('wallet:debug')
  .description('Debug wallet details')
).action((opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) {
    console.error('No wallet found.');
    process.exit(1);
  }
  console.log('🔍 Wallet Debug Info:');
  console.log('File:', getKeyfile(opts));
  console.log('Algo:', wallet.algo || 'ed25519');
  console.log('Index:', wallet.index ?? 0);
  if (wallet.seed) {
    console.log('Seed length:', wallet.seed.length);
    console.log('Seed preview:', wallet.seed.substring(0, 20) + '...');
  }
  
  try {
    const acct = accountFromWallet(wallet);
    console.log('Address:', acct.publicKeyString.toString());
    console.log('Key type:', acct.keyType);
    console.log('Has private key:', acct.hasPrivateKey);
  } catch (err) {
    console.error('Error creating account:', err);
  }
});

program
  .command('debug:balance-raw')
  .description('Debug raw balance response')
  .action(async () => {
    const wallet = loadWallet();
    if (!wallet) { console.error('No wallet found.'); process.exit(1); }
    const acct = accountFromWallet(wallet);
    const client = clientFrom('test', acct);
    
    try {
      console.log('🔍 Raw balance response:');
      const all = await client.allBalances();
      console.log('Type:', typeof all);
      console.log('Keys:', Object.keys(all));
      
      // Show network info
      console.log('\\n📋 Network Info:');
      console.log('Base Token Address:', client.baseToken.publicKeyString.toString());
      console.log('Network Address:', client.networkAddress.publicKeyString.toString());
      
      for (const [key, value] of Object.entries(all)) {
        console.log(`\\n🪙 Token \"${key}\":`);
        console.log(`   Value type: ${typeof value}`);
        console.log(`   Value constructor: ${value.constructor.name}`);
        console.log(`   Value keys:`, Object.keys(value || {}));
        
        // Try different ways to get the balance
        console.log(`   Direct toString: ${value}`);
        if (value && typeof value === 'object') {
          console.log(`   JSON attempt:`, JSON.stringify(value, (k, v) => typeof v === 'bigint' ? v.toString() : v));
        }
        
        // Check if this is the base token
        const baseTokenStr = client.baseToken.publicKeyString.toString();
        if (key === baseTokenStr) {
          console.log(`   ✅ This is the base token!`);
        } else if (key === '0') {
          console.log(`   This might be base token by ID`);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });

networkOpt(
program
  .command('balance')
  .description('Get balance; optionally specify token & address')
  .option('--token <id>', 'token account id 0x...')
  .option('--address <addr>', 'address to query (defaults to your wallet)')
).action(async (opts) => {
  const keyfile = getKeyfile(opts);
  let acct;
  if (opts.address) acct = asAccount(opts.address);
  else {
    const wallet = loadWallet(keyfile);
    if (!wallet) { console.error('No wallet found.'); process.exit(1); }
    acct = accountFromWallet(wallet);
  }
  
  console.log('🔗 Connecting to network:', opts.network);
  console.log('📋 Querying account:', acct.publicKeyString.toString());
  
  try {
    const client = clientFrom(opts.network, acct);
    if (opts.token) {
      console.log('🪙 Checking token balance...');
      const bal = await client.balance(opts.token);
      console.log(bal.toString());
    } else {
      console.log('💰 Checking all balances...');
      const all = await client.allBalances();
      if (Object.keys(all).length === 0) {
        console.log('No balances found (account may not be activated)');
      } else {
        console.log('💰 Balances:');
        
        // Get the base token address for reference
        const baseTokenAddr = client.baseToken.publicKeyString.toString();
        
        for (const [tokenId, balanceData] of Object.entries(all)) {
          // Extract token address and balance from the response structure  
          // Use JSON conversion to get the actual address string
          const tokenInfo = JSON.parse(JSON.stringify(balanceData, (k, v) => typeof v === 'bigint' ? v.toString() : v));
          const tokenAddr = tokenInfo.token;
          const balance = tokenInfo.balance;
          
          // Display token information with proper names
          let tokenDisplay;
          if (tokenAddr === baseTokenAddr) {
            tokenDisplay = `KEETA (Base Token)`;
          } else {
            // Try to fetch token name for better display
            try {
              const tokenAccount = asAccount(tokenAddr);
              const accountInfo = await client.client.getAccountInfo(tokenAccount);
              
              if (accountInfo.info && accountInfo.info.name) {
                tokenDisplay = `${accountInfo.info.name} (${tokenAddr.substring(0, 12)}...)`;
              } else {
                tokenDisplay = `${tokenAddr.substring(0, 12)}...`;
              }
            } catch {
              tokenDisplay = `${tokenAddr.substring(0, 12)}...`;
            }
          }
          
          console.log(`  ${tokenDisplay}: ${balance}`);
        }
        console.log(`\n💡 Use 'keeta tokens:list' for detailed token information`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    console.log('💡 Tip: This might be a network connectivity issue or the account is not activated on the network');
  }
});

networkOpt(keyfileOpt(
program
  .command('info')
  .description('Get account information and state')
  .option('--address <addr>', 'address to query (defaults to your wallet)')
)).action(async (opts) => {
  const keyfile = getKeyfile(opts);
  let acct;
  if (opts.address) acct = asAccount(opts.address);
  else {
    const wallet = loadWallet(keyfile);
    if (!wallet) { console.error('No wallet found.'); process.exit(1); }
    acct = accountFromWallet(wallet);
  }
  const client = clientFrom(opts.network, acct);
  const state = await client.state();
  console.log('Account:', state.account.publicKeyString.toString());
  console.log('Head Block:', state.currentHeadBlock || 'none');
  console.log('Height:', state.currentHeadBlockHeight || '0');
  console.log('Representative:', state.representative?.publicKeyString.toString() || 'none');
});

networkOpt(keyfileOpt(
program
  .command('history')
  .description('Get transaction history for account')
  .option('--limit <n>', 'max number of entries', '10')
  .option('--detailed', 'show detailed transaction information')
)).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  const history = await client.history({ depth: parseInt(opts.limit) });
  
  console.log(`📋 Last ${history.length} transactions:`);
  
  if (opts.detailed) {
    console.log('');
    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const blockHash = entry.voteStaple.blocksHash.toString().substring(0, 16);
      const blockCount = entry.voteStaple.blocks.length;
      
      console.log(`[${i + 1}] 🧾 Transaction ${blockHash}...`);
      console.log(`    📦 Blocks: ${blockCount}`);
      
      // Try to extract transaction details from blocks
      try {
        for (const block of entry.voteStaple.blocks) {
          const blockData = JSON.parse(JSON.stringify(block, (k, v) => typeof v === 'bigint' ? v.toString() : v));
          
          if (blockData.operation) {
            console.log(`    🔄 Operation: ${blockData.operation.type || 'Unknown'}`);
            
            // Show amounts and tokens involved
            if (blockData.operation.amount) {
              console.log(`    💰 Amount: ${blockData.operation.amount}`);
            }
            
            if (blockData.operation.token) {
              const tokenAddr = blockData.operation.token;
              if (tokenAddr === client.baseToken.publicKeyString.toString()) {
                console.log(`    🪙 Token: KEETA (Base Token)`);
              } else {
                try {
                  const tokenAccount = asAccount(tokenAddr);
                  const accountInfo = await client.client.getAccountInfo(tokenAccount);
                  const tokenName = accountInfo.info?.name || 'Unknown';
                  console.log(`    🪙 Token: ${tokenName} (${tokenAddr.substring(0, 12)}...)`);
                } catch {
                  console.log(`    🪙 Token: ${tokenAddr.substring(0, 12)}...`);
                }
              }
            }
            
            // Show to/from addresses
            if (blockData.operation.to) {
              console.log(`    📤 To: ${blockData.operation.to.substring(0, 16)}...`);
            }
            if (blockData.operation.from) {
              console.log(`    📥 From: ${blockData.operation.from.substring(0, 16)}...`);
            }
          }
          
          // Show timestamp if available
          if (blockData.timestamp) {
            const date = new Date(parseInt(blockData.timestamp) * 1000);
            console.log(`    🕒 Time: ${date.toLocaleString()}`);
          }
        }
      } catch (error) {
        console.log(`    ⚠️  Could not parse transaction details`);
      }
      
      console.log('');
    }
  } else {
    // Original simple format
    for (const entry of history) {
      const blockHash = entry.voteStaple.blocksHash.toString().substring(0, 12);
      const blockCount = entry.voteStaple.blocks.length;
      
      // Try to get basic transaction info for summary
      let txType = '';
      let amount = '';
      try {
        if (entry.voteStaple.blocks.length > 0) {
          const block = entry.voteStaple.blocks[0];
          const blockData = JSON.parse(JSON.stringify(block, (k, v) => typeof v === 'bigint' ? v.toString() : v));
          if (blockData.operation?.type) {
            txType = ` [${blockData.operation.type}]`;
          }
          if (blockData.operation?.amount) {
            amount = ` (${blockData.operation.amount})`;
          }
        }
      } catch {}
      
      console.log(`  ${blockHash}... (${blockCount} blocks)${txType}${amount}`);
    }
  }
});

networkOpt(keyfileOpt(
program
  .command('chain')
  .description('Get block chain for account')
  .option('--limit <n>', 'max number of blocks', '10')
)).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  const chain = await client.chain({ depth: parseInt(opts.limit) });
  console.log(`🔗 Last ${chain.length} blocks:`);
  for (const block of chain) {
    console.log(`  ${block.hash.toString().substring(0, 12)}... (${block.operations.length} ops)`);
  }
});

networkOpt(keyfileOpt(
program
  .command('recover')
  .description('Recover incomplete transactions')
)).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  const result = await client.recover();
  if (result) {
    console.log('✅ Recovered transaction:', result.blocksHash.toString().substring(0, 12) + '...');
  } else {
    console.log('ℹ️  No incomplete transactions found');
  }
});

networkOpt(
program
  .command('send')
  .description('Send token to a recipient')
  .requiredOption('--token <id>', 'token account id 0x...')
  .requiredOption('--to <addr>', 'recipient address')
  .requiredOption('--amount <n>', 'integer amount')
).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  const builder = client.initBuilder();
  builder.send(asAccount(opts.to), BigInt(opts.amount), opts.token);
  const res = await builder.publish();
  console.log('✅ Sent. Publish result:', res.from);
});

networkOpt(
program
  .command('token:supply')
  .description('Adjust total supply (requires TOKEN_ADMIN_SUPPLY)')
  .requiredOption('--token <id>', 'token account id 0x... (context account)')
  .option('--add <n>', 'increase supply by N')
  .option('--sub <n>', 'decrease supply by N')
).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  if (!opts.add && !opts.sub) { console.error('Use --add or --sub'); process.exit(1); }
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  const builder = client.initBuilder({ account: asAccount(opts.token) });
  const delta = BigInt(opts.add || 0) - BigInt(opts.sub || 0);
  if (delta === 0n) { console.error('No-op'); process.exit(1); }
  builder.modifyTokenSupply(delta);
  const res = await builder.publish();
  console.log('✅ Supply adjusted by', delta.toString(), 'for token', opts.token, 'result:', res.from);
});

networkOpt(
program
  .command('token:mint')
  .description('Mint and send to recipient (requires TOKEN_ADMIN_SUPPLY & TOKEN_ADMIN_BALANCE)')
  .requiredOption('--token <id>', 'token account id 0x...')
  .requiredOption('--to <addr>', 'recipient')
  .requiredOption('--amount <n>', 'amount')
).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  // Context: token ops run with `account` set to token id for supply edits
  // then we credit our wallet balance and send to recipient.
  const token = asAccount(opts.token);
  const builder = client.initBuilder({ account: token });
  const amt = BigInt(opts.amount);
  builder.modifyTokenSupply(amt);
  builder.modifyTokenBalance(opts.token, amt, false, { account: acct });
  builder.send(asAccount(opts.to), amt, opts.token);
  const res = await builder.publish();
  console.log('✅ Minted and sent', amt.toString(), 'to', opts.to, '| publish:', res.from);
});

networkOpt(
program
  .command('token:burn')
  .description('Burn from address (default: your wallet)')
  .requiredOption('--token <id>', 'token account id 0x...')
  .option('--from <addr>', 'burn from this holder (default: your wallet)')
  .requiredOption('--amount <n>', 'amount')
).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  const holder = opts.from ? asAccount(opts.from) : accountFromWallet(wallet);
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  const token = asAccount(opts.token);
  const builder = client.initBuilder({ account: token });
  const amt = BigInt(opts.amount);
  // Reduce holder balance then reduce total supply
  builder.modifyTokenBalance(opts.token, -amt, false, { account: holder });
  builder.modifyTokenSupply(-amt);
  const res = await builder.publish();
  console.log('✅ Burned', amt.toString(), 'from', opts.from || '(self)', '| publish:', res.from);
});

networkOpt(keyfileOpt(
program
  .command('token:create')
  .description('Create a new token (like Keeta web wallet)')
  .option('--name <name>', 'token name (e.g., "My Awesome Token")')
  .option('--symbol <symbol>', 'token symbol - 4 letters max (e.g., "MTKN")')
  .option('--supply <amount>', 'total token supply to create (default: 1000000)', '1000000')
  .option('--decimals <decimals>', 'decimal places - smallest unit (default: 0)', '0')
  .option('--mode <mode>', 'access mode: private|public (default: public)', 'public')
)).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  
  console.log('🚀 Creating new token...');
  
  // Generate the token identifier
  const token = await client.generateIdentifier(AccountKeyAlgorithm.TOKEN);
  const tokenAddress = JSON.parse(JSON.stringify(token));
  
  console.log('✅ Token created successfully!');
  console.log(`🪙 Token Address: ${tokenAddress}`);
  console.log(`📋 Network: ${opts.network}`);
  
  // Set up token metadata if name is provided
  if (opts.name || opts.description) {
    console.log('');
    console.log('📝 Setting up token metadata...');
    
    try {
      // Create a transaction to set token metadata
      const builder = client.initBuilder();
      
      // Set token name if provided
      if (opts.name) {
        console.log(`   Setting name: ${opts.name}`);
        // Note: This would need the appropriate SDK method for setting token metadata
        // For now, we'll show what would be done
      }
      
      if (opts.description) {
        console.log(`   Setting description: ${opts.description}`);
      }
      
      console.log('⚠️  Note: Token metadata setting requires specific SDK methods');
      console.log('   You may need to set metadata manually through other means');
      
    } catch (error) {
      console.log('⚠️  Could not set token metadata automatically');
    }
  }
  
  // Set initial supply if specified
  if (opts.supply && parseInt(opts.supply) > 0) {
    console.log('');
    console.log(`💰 Setting initial supply: ${opts.supply}...`);
    
    try {
      const tokenAccount = asAccount(tokenAddress);
      const builder = client.initBuilder({ account: tokenAccount });
      builder.modifyTokenSupply(BigInt(opts.supply));
      const result = await builder.publish();
      console.log('✅ Initial supply set successfully!');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.log('❌ Failed to set initial supply:', errorMsg);
      console.log(`💡 You can set supply manually: keeta token:supply --token ${tokenAddress} --add ${opts.supply}`);
    }
  }
  
  console.log('');
  console.log('🎉 Token creation complete!');
  
  if (opts.name) {
    console.log(`� Name: ${opts.name}`);
  }
  if (opts.description) {
    console.log(`📄 Description: ${opts.description}`);
  }
  if (opts.supply && parseInt(opts.supply) > 0) {
    console.log(`💰 Supply: ${opts.supply}`);
  }
  
  console.log('');
  console.log('💡 Next steps:');
  if (!opts.supply || parseInt(opts.supply) === 0) {
    console.log(`   • Set token supply: keeta token:supply --token ${tokenAddress} --add 1000000`);
  }
  console.log(`   • Check token info: keeta tokens:list`);
  console.log(`   • Send tokens: keeta send --token ${tokenAddress} --to <address> --amount <amount>`);
});

networkOpt(keyfileOpt(
program
  .command('tokens:list')
  .description('List all tokens with details')
)).action(async (opts) => {
  const wallet = loadWallet(getKeyfile(opts));
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }
  const acct = accountFromWallet(wallet);
  const client = clientFrom(opts.network, acct);
  
  try {
    console.log('🪙 Token Details:');
    const balances = await client.allBalances();
    const baseTokenAddr = client.baseToken.publicKeyString.toString();
    const networkAddr = client.networkAddress.publicKeyString.toString();
    
    console.log(`\n📋 Network Information:`);
    console.log(`   Network Address: ${networkAddr}`);
    console.log(`   Base Token Address: ${baseTokenAddr}`);
    
    for (const [tokenId, balanceData] of Object.entries(balances)) {
      // Extract token address and balance from the response structure
      // Use JSON conversion to get the actual address string  
      const tokenInfo = JSON.parse(JSON.stringify(balanceData, (k, v) => typeof v === 'bigint' ? v.toString() : v));
      const tokenAddr = tokenInfo.token;
      const balance = tokenInfo.balance;
      
      console.log(`\n📋 Token #${tokenId}:`);
      console.log(`   Address: ${tokenAddr}`);
      console.log(`   Balance: ${balance}`);
      
      if (tokenAddr === baseTokenAddr) {
        console.log(`   Name: KEETA (Base Token)`);
        console.log(`   Type: Network base currency`);
        console.log(`   Description: Primary currency of the Keeta network`);
      } else {
        // Try to fetch token metadata
        try {
          console.log(`   Fetching token info...`);
          const tokenAccount = asAccount(tokenAddr);
          const accountInfo = await client.client.getAccountInfo(tokenAccount);
          
          if (accountInfo.info && accountInfo.info.name) {
            console.log(`   Name: ${accountInfo.info.name}`);
          } else {
            console.log(`   Name: (No name set)`);
          }
          
          if (accountInfo.info && accountInfo.info.description) {
            console.log(`   Description: ${accountInfo.info.description}`);
          } else {
            console.log(`   Description: Custom token on Keeta network`);
          }
          
          console.log(`   Type: Custom token`);
        } catch (err) {
          console.log(`   Name: (Unable to fetch - ${err instanceof Error ? err.message : 'Unknown error'})`);
          console.log(`   Type: Custom token on Keeta network`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error fetching token details:', error instanceof Error ? error.message : String(error));
  }
});

program.parseAsync(process.argv);
