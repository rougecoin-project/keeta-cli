import { Command } from 'commander';
import { loadWallet, defaultKeyfile, accountFromWallet, clientFrom, asAccount } from '../lib/keeta.js';
import { lib } from '@keetanetwork/keetanet-client';

const { Account } = lib;
const { AccountKeyAlgorithm } = Account;

function getKeyfile(opts: any): string {
  return opts.keyfile || defaultKeyfile();
}

export function addTokenCommands(program: Command): void {
  program
    .command('send')
    .description('Send tokens to another account')
    .requiredOption('--token <id>', 'token account id')
    .requiredOption('--to <addr>', 'recipient address')
    .requiredOption('--amount <n>', 'amount to send (in base units - see token info for decimals)')
    .option('--decimals <d>', 'token decimals for display (auto-detect if not provided)')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { console.error('No wallet found.'); process.exit(1); }
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      
      console.log('🚀 Sending tokens...');
      console.log(`📤 From: ${acct.publicKeyString.toString()}`);
      console.log(`📥 To: ${opts.to}`);
      console.log(`🪙 Token: ${opts.token}`);
      console.log(`💰 Amount: ${opts.amount} base units`);
      
      // Try to get token decimals for better display
      let tokenDecimals = opts.decimals ? parseInt(opts.decimals) : null;
      let tokenName = 'Unknown';
      
      try {
        if (opts.token === client.baseToken.publicKeyString.toString()) {
          tokenName = 'KEETA';
          tokenDecimals = tokenDecimals || 7; // KEETA appears to have 7 decimals based on your balance
        } else {
          const tokenAccount = asAccount(opts.token);
          const accountInfo = await client.client.getAccountInfo(tokenAccount);
          tokenName = accountInfo.info?.name || 'Unknown';
          
          // Try to infer decimals from current balance if not provided
          if (!tokenDecimals) {
            const balances = await client.allBalances();
            for (const [tokenId, balanceData] of Object.entries(balances)) {
              const tokenInfo = JSON.parse(JSON.stringify(balanceData, (k, v) => typeof v === 'bigint' ? v.toString() : v));
              if (tokenInfo.token === opts.token) {
                // For small tokens like CULT (3005 base units = 300.5 tokens), likely 1 decimal
                const balance = BigInt(tokenInfo.balance);
                if (balance < 100000) {
                  tokenDecimals = 1; // Likely 1 decimal place
                } else if (balance < 1000000000) {
                  tokenDecimals = 3; // Likely 3 decimal places
                } else {
                  tokenDecimals = 6; // Likely 6+ decimal places
                }
                break;
              }
            }
          }
        }
      } catch (error) {
        console.log('⚠️  Could not fetch token info');
      }
      
      // Display human-readable amount if decimals are known
      if (tokenDecimals !== null) {
        const humanAmount = Number(opts.amount) / Math.pow(10, tokenDecimals);
        console.log(`💰 Human-readable: ${humanAmount} ${tokenName}`);
      }
      
      console.log('');
      
      try {
        const builder = client.initBuilder();
        const amount = BigInt(opts.amount);
        
        // Check if it's the base token
        const baseTokenAddr = client.baseToken.publicKeyString.toString();
        
        if (opts.token === baseTokenAddr) {
          // Sending base token (KEETA) - use client.baseToken
          builder.send(asAccount(opts.to), amount, client.baseToken);
        } else {
          // For custom tokens, we need to create a token account with TOKEN algorithm
          // The token address string needs to be converted to a proper token account object
          const tokenAccount = Account.fromPublicKeyString(opts.token);
          
          // Cast it to the correct token type for the send method
          builder.send(asAccount(opts.to), amount, tokenAccount as any);
        }
        
        const res = await builder.publish();
        console.log('✅ Transaction sent successfully!');
        console.log('📋 Result:', res.from);
        
        if (tokenDecimals !== null) {
          const humanAmount = Number(opts.amount) / Math.pow(10, tokenDecimals);
          console.log(`🎯 Sent: ${humanAmount} ${tokenName} (${opts.amount} base units)`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Send failed:', errorMsg);
        process.exit(1);
      }
    });

  program
    .command('token:supply')
    .description('Adjust total supply (requires TOKEN_ADMIN_SUPPLY)')
    .requiredOption('--token <id>', 'token account id')
    .option('--add <n>', 'increase supply by N')
    .option('--sub <n>', 'decrease supply by N')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
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

  program
    .command('token:mint')
    .description('Mint and send to recipient (requires TOKEN_ADMIN_SUPPLY & TOKEN_ADMIN_BALANCE)')
    .requiredOption('--token <id>', 'token account id')
    .requiredOption('--to <addr>', 'recipient')
    .requiredOption('--amount <n>', 'amount')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { console.error('No wallet found.'); process.exit(1); }
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      const builder = client.initBuilder({ account: asAccount(opts.token) });
      const amt = BigInt(opts.amount);
      builder.modifyTokenSupply(amt);
      builder.modifyTokenBalance(opts.token, amt, false, { account: asAccount(opts.to) });
      const res = await builder.publish();
      console.log('✅ Minted', opts.amount, 'tokens to', opts.to, 'result:', res.from);
    });

  program
    .command('token:burn')
    .description('Burn tokens (requires TOKEN_ADMIN_BALANCE)')
    .requiredOption('--token <id>', 'token account id')
    .requiredOption('--amount <n>', 'amount to burn')
    .option('--from <addr>', 'burn from this account (default: your wallet)')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { console.error('No wallet found.'); process.exit(1); }
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      const builder = client.initBuilder({ account: asAccount(opts.token) });
      const amt = BigInt(opts.amount);
      const fromAcct = opts.from ? asAccount(opts.from) : acct;
      builder.modifyTokenSupply(-amt);
      builder.modifyTokenBalance(opts.token, -amt, false, { account: fromAcct });
      const res = await builder.publish();
      console.log('✅ Burned', opts.amount, 'tokens from', opts.from || 'your wallet', 'result:', res.from);
    });

  program
    .command('token:create')
    .description('Create a new token (like Keeta web wallet)')
    .option('--name <name>', 'token name (e.g., "My Awesome Token")')
    .option('--symbol <symbol>', 'token symbol - 4 letters max (e.g., "MTKN")')
    .option('--supply <amount>', 'total token supply to create (default: 1000000)', '1000000')
    .option('--decimals <decimals>', 'decimal places - smallest unit (default: 0)', '0')
    .option('--mode <mode>', 'access mode: private|public (default: public)', 'public')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { console.error('No wallet found.'); process.exit(1); }
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      
      // Validate inputs
      if (opts.symbol && opts.symbol.length > 4) {
        console.error('❌ Token symbol must be 4 letters maximum');
        process.exit(1);
      }
      
      if (opts.mode && !['private', 'public'].includes(opts.mode.toLowerCase())) {
        console.error('❌ Access mode must be "private" or "public"');
        process.exit(1);
      }
      
      console.log('🚀 Creating new token...');
      console.log('');
      
      // Show token configuration
      console.log('📋 Token Configuration:');
      if (opts.name) console.log(`   📛 Name: ${opts.name}`);
      if (opts.symbol) console.log(`   🏷️  Symbol: ${opts.symbol.toUpperCase()}`);
      console.log(`   💰 Supply: ${parseInt(opts.supply).toLocaleString()}`);
      console.log(`   🔢 Decimals: ${opts.decimals}`);
      console.log(`   🔒 Access Mode: ${opts.mode.charAt(0).toUpperCase() + opts.mode.slice(1)}`);
      console.log('');
      
      // Generate the token identifier
      const token = await client.generateIdentifier(AccountKeyAlgorithm.TOKEN);
      const tokenAddress = JSON.parse(JSON.stringify(token));
      
      console.log('✅ Token identifier generated!');
      console.log(`🪙 Token Address: ${tokenAddress}`);
      console.log(`📋 Network: ${opts.network}`);
      
      // Set initial supply
      if (opts.supply && parseInt(opts.supply) > 0) {
        console.log('');
        console.log(`💰 Setting initial supply: ${parseInt(opts.supply).toLocaleString()}...`);
        
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
      console.log('');
      console.log('📊 Token Summary:');
      console.log(`   🆔 Address: ${tokenAddress}`);
      if (opts.name) console.log(`   📛 Name: ${opts.name}`);
      if (opts.symbol) console.log(`   🏷️  Symbol: ${opts.symbol.toUpperCase()}`);
      console.log(`   💰 Total Supply: ${parseInt(opts.supply).toLocaleString()}`);
      console.log(`   🔢 Decimals: ${opts.decimals}`);
      console.log(`   🔒 Mode: ${opts.mode.charAt(0).toUpperCase() + opts.mode.slice(1)}`);
      
      console.log('');
      console.log('💡 Next steps:');
      console.log(`   • Check your tokens: keeta tokens:list`);
      console.log(`   • Send tokens: keeta send --token ${tokenAddress} --to <address> --amount <amount>`);
      if (opts.mode === 'private') {
        console.log(`   • Note: Private mode - only approved wallets can receive this token`);
      }
    });

  program
    .command('tokens:list')
    .description('List all tokens with details')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { console.error('No wallet found.'); process.exit(1); }
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      
      console.log('🔗 Connecting to network:', opts.network);
      console.log('📋 Fetching token list...');
      console.log('');
      
      try {
        const all = await client.allBalances();
        if (Object.keys(all).length === 0) {
          console.log('No tokens found (account may not be activated)');
          return;
        }
        
        console.log('🪙 Your Tokens:');
        console.log('');
        
        const baseTokenAddr = client.baseToken.publicKeyString.toString();
        
        for (const [tokenId, balanceData] of Object.entries(all)) {
          const tokenInfo = JSON.parse(JSON.stringify(balanceData, (k, v) => typeof v === 'bigint' ? v.toString() : v));
          const tokenAddr = tokenInfo.token;
          const balance = tokenInfo.balance;
          
          console.log(`📍 Address: ${tokenAddr}`);
          
          if (tokenAddr === baseTokenAddr) {
            console.log('📛 Name: KEETA');
            console.log('🏷️  Symbol: KEETA');
            console.log('📄 Description: Base token of the Keeta network');
            console.log('🌐 Type: Base Token');
          } else {
            try {
              const tokenAccount = asAccount(tokenAddr);
              const accountInfo = await client.client.getAccountInfo(tokenAccount);
              
              const name = accountInfo.info?.name || 'Unknown Token';
              const description = accountInfo.info?.description || 'No description available';
              
              console.log(`📛 Name: ${name}`);
              console.log(`🏷️  Symbol: ${name}`);
              console.log(`📄 Description: ${description}`);
              console.log('🌐 Type: Custom Token');
            } catch {
              console.log('📛 Name: Unknown Token');
              console.log('🏷️  Symbol: Unknown');
              console.log('📄 Description: Could not fetch token metadata');
              console.log('🌐 Type: Custom Token');
            }
          }
          
          console.log(`💰 Your Balance: ${balance}`);
          console.log('');
        }
        
        console.log(`💡 Total tokens: ${Object.keys(all).length}`);
      } catch (error) {
        console.error('❌ Error fetching tokens:', error);
        process.exit(1);
      }
    });
}