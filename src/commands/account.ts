import { Command } from 'commander';
import { loadWallet, defaultKeyfile, accountFromWallet, clientFrom, asAccount } from '../lib/keeta.js';

function getKeyfile(opts: any): string {
  return opts.keyfile || defaultKeyfile();
}

export function addAccountCommands(program: Command): void {
  program
    .command('balance')
    .description('Check account balance')
    .option('--token <id>', 'specific token to check')
    .option('--address <addr>', 'check another account address')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      let acct;
      if (opts.address) acct = asAccount(opts.address);
      else {
        const wallet = loadWallet(getKeyfile(opts));
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
            
            console.log(`\\n💡 Use 'keeta tokens:list' for detailed token information`);
          }
        }
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    });

  program
    .command('info')
    .description('Get account information')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { console.error('No wallet found.'); process.exit(1); }
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      const state = await client.client.getAccountInfo(acct);
      console.log('Account:', acct.publicKeyString.toString());
      console.log('Network:', opts.network);
      console.log('Balances:', Object.keys(state.balances || {}).length);
      console.log('Representative:', state.representative?.publicKeyString.toString() || 'none');
    });

  program
    .command('history')
    .description('Get transaction history for account')
    .option('--limit <n>', 'max number of entries', '10')
    .option('--detailed', 'show detailed transaction information')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
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

  program
    .command('chain')
    .description('Get block chain for account')
    .option('--limit <n>', 'max number of blocks', '10')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { console.error('No wallet found.'); process.exit(1); }
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      const chain = await client.chain({ depth: parseInt(opts.limit) });
      console.log(`📋 Last ${chain.length} blocks:`);
      for (const block of chain) {
        const blockInfo = JSON.parse(JSON.stringify(block, (k, v) => typeof v === 'bigint' ? v.toString() : v));
        const hash = blockInfo.hash || 'unknown';
        console.log(`  ${hash.toString().substring(0, 12)}...`);
      }
    });

  program
    .command('recover')
    .description('Recover incomplete transactions')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { console.error('No wallet found.'); process.exit(1); }
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      await client.recover();
      console.log('✅ Recovery complete');
    });
}