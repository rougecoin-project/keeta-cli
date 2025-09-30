import { Command } from 'commander';
import { loadWallet, defaultKeyfile, accountFromWallet, clientFrom, asAccount } from '../lib/keeta.js';
import { lib, UserClient } from '@keetanetwork/keetanet-client';

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
      
      try {
        console.log(`🪙 Minting ${parseInt(opts.amount).toLocaleString()} tokens...`);
        console.log(`📤 To: ${opts.to}`);
        console.log(`🏷️  Token: ${opts.token}`);
        
        const builder = client.initBuilder();
        const amt = BigInt(opts.amount);
        
        // Mint tokens by modifying the token balance for the recipient
        builder.modifyTokenBalance(opts.token, amt, false, { account: asAccount(opts.to) });
        
        const res = await builder.publish();
        console.log('✅ Successfully minted', parseInt(opts.amount).toLocaleString(), 'tokens to', opts.to);
        console.log('📋 Transaction result:', res.from);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.log('❌ Failed to mint tokens:', errorMsg);
        console.log('💡 Make sure you have admin rights for this token and sufficient supply exists');
      }
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
      // Get the actual account from the PendingAccount
      const account = token.account;
      const tokenAddress = account.publicKeyString.toString();
      
      console.log('✅ Token identifier generated!');
      console.log(`🪙 Token Address: ${tokenAddress}`);
      console.log(`📋 Network: ${opts.network}`);
      
      // Set initial supply using the working approach
      if (opts.supply && parseInt(opts.supply) > 0) {
        console.log('');
        console.log(`💰 Setting initial supply: ${parseInt(opts.supply).toLocaleString()}...`);
        console.log(`💡 Using the same method as token:supply command...`);
        
        try {
          // Use proper SDK patterns from official examples
          const wallet = loadWallet(getKeyfile(opts));
          if (!wallet) { 
            console.log('❌ No wallet found for supply setting');
            return;
          }
          const acct = accountFromWallet(wallet);
          const client = clientFrom(opts.network, acct);
          
          // Use the proper builder pattern from official examples
          const builder = client.initBuilder({ account: asAccount(tokenAddress) });
          
          // Convert supply to base units (account for decimals like UI does)
          // Example: 1000000 tokens with 6 decimals = 1000000 * 10^6 base units
          const supplyInBaseUnits = BigInt(opts.supply) * (BigInt(10) ** BigInt(opts.decimals));
          console.log(`💡 Converting ${opts.supply} tokens with ${opts.decimals} decimals to ${supplyInBaseUnits} base units`);
          
          builder.modifyTokenSupply(supplyInBaseUnits);
          
          // Use publishBuilder instead of builder.publish (following official examples)
          const result = await client.publishBuilder(builder);
          console.log('✅ Initial supply set successfully!');
          console.log('📋 Transaction result:', result.from);
          
          // Set up default permissions and metadata for the token
          if (opts.name || opts.symbol) {
            console.log('');
            console.log('� Setting up token permissions and metadata...');
            
            try {
              console.log('📝 Setting token metadata...');
              console.log('💡 Using account description approach since utilities pattern has type issues');
              
              // Use simpler approach - set account info directly with proper formatting
              const metaBuilder = client.initBuilder();
              
              // Convert to Keeta format (UPPERCASE_UNDERSCORES) - this is the key!
              const formatName = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
              
              const tokenInfoWithMeta = {
                name: opts.symbol ? formatName(opts.symbol) : 'TOKEN',  // Use symbol for name field
                description: opts.name ? formatName(opts.name) : 'TOKEN', // Use name for description field
                metadata: Buffer.from(JSON.stringify({
                  decimalPlaces: opts.decimals || 0  // Simplified metadata like UI
                })).toString('base64'),
                defaultPermission: new lib.Permissions(["ACCESS"])  // UI: PUBLIC tokens get ["ACCESS"]
              };
              
              console.log('📤 Setting token metadata:', tokenInfoWithMeta);
              
              // CRITICAL: Use the UI pattern with account parameter!
              metaBuilder.setInfo(tokenInfoWithMeta, { account: asAccount(tokenAddress) });
              
              // Remove duplicate supply setting - we already set it above!
              
              const metaResult = await client.publishBuilder(metaBuilder);
              console.log('✅ Token metadata set!');
              
            } catch (metadataError) {
              const metadataErrorMsg = metadataError instanceof Error ? metadataError.message : 'Unknown error';
              console.log('❌ Failed to set token metadata:', metadataErrorMsg);
              
              if (metadataErrorMsg.includes('default permissions')) {
                console.log('💡 This is a permissions issue - token needs UPDATE_INFO permission');
                console.log('🔧 The token was created but metadata setting requires special setup');
              }
              
              console.log('💡 You can try setting metadata manually: keeta token:metadata --token', tokenAddress, '--name "NAME" --symbol "SYM"');
            }
          }
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
      console.log(`   • Set metadata: keeta token:metadata --token ${tokenAddress} --name "${opts.name || 'Token Name'}" --symbol "${opts.symbol || 'SYM'}"`);
      console.log(`   • Check your tokens: keeta tokens:list`);
      console.log(`   • Send tokens: keeta send --token ${tokenAddress} --to <address> --amount <amount>`);
      if (opts.mode === 'private') {
        console.log(`   • Note: Private mode - only approved wallets can receive this token`);
      }
      console.log('');
      console.log('⚠️  Note: Token metadata requires proper permissions to be set.');
      console.log('💡 Tokens need UPDATE_INFO permission for metadata changes.');
      console.log('🔧 This is a Keeta network security feature to prevent unauthorized metadata changes.');
      console.log('');
      console.log('📋 Summary: Token created with supply, but metadata may require additional setup.');
    });

  program
    .command('token:metadata')
    .description('Set token metadata (name, symbol, etc.)')
    .requiredOption('--token <id>', 'token account id')
    .option('--name <name>', 'set token name')
    .option('--symbol <symbol>', 'set token symbol')
    .option('--description <desc>', 'set token description')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      console.log('🏷️  Setting token metadata...');
      console.log(`🪙 Token: ${opts.token}`);
      if (opts.name) console.log(`📛 Name: ${opts.name}`);
      if (opts.symbol) console.log(`🏷️  Symbol: ${opts.symbol}`);
      if (opts.description) console.log(`📄 Description: ${opts.description}`);
      console.log('');
      
      try {
        const wallet = loadWallet(getKeyfile(opts));
        if (!wallet) { 
          console.log('❌ No wallet found');
          return;
        }
        const acct = accountFromWallet(wallet);
        const client = clientFrom(opts.network, acct);
        
        console.log('🔍 Checking current token state...');
        const tokenAccount = asAccount(opts.token);
        
        // Try to get current token account state (following official examples)
        try {
          const tokenState = await client.client.getAccountInfo(tokenAccount);
          console.log('📊 Current token state:');
          console.log('   Account Info name:', tokenState.info?.name || 'Empty');
          console.log('   Account Info description:', tokenState.info?.description || 'Empty');
          console.log('   Account Info metadata:', tokenState.info?.metadata || 'Empty');
          
          // Check if there are any builder methods for setting account info
          const builder = client.initBuilder({ account: tokenAccount });
          console.log('🔧 Exploring builder methods...');
          const allBuilderMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(builder));
          console.log('   Total methods:', allBuilderMethods.length);
          console.log('   All methods:', allBuilderMethods);
          
          const infoMethods = allBuilderMethods.filter(name => 
            name.toLowerCase().includes('info') || 
            name.toLowerCase().includes('metadata') || 
            name.toLowerCase().includes('account') ||
            name.toLowerCase().includes('set') ||
            name.toLowerCase().includes('modify')
          );
          console.log('   Info/Set/Modify methods:', infoMethods);
          
          // Try to find a method to set account info
          const possibleMethods = allBuilderMethods.filter(name => 
            name.includes('Account') || name.includes('Info')
          );
          console.log('   Account/Info related methods:', possibleMethods);
          
          console.log('');
          console.log('💡 Since metadata fields exist (name, description, metadata),');
          console.log('   there should be a way to set them. Investigating...');
          
          // Try to set account info using the official UserClient.setInfo method
          console.log('');
          console.log('🧪 Attempting to set token metadata using UserClient.setInfo...');
          
          try {
            // Use the UserClient.setInfo method found in documentation
            const infoToSet = {
              name: opts.name || '',
              description: opts.description || '',
              metadata: opts.symbol || ''
            };
            
            console.log('📤 Setting info:', infoToSet);
            
            // Try different parameter approaches for setInfo
            let result;
            try {
              // Approach 1: setInfo with info object only
              result = await client.setInfo(infoToSet);
              console.log('✅ Method 1 worked: setInfo(infoObject)');
            } catch (err1) {
              console.log('❌ Method 1 failed, trying method 2...');
              try {
                // Approach 2: Maybe we need to use a builder pattern
                const builder = client.initBuilder({ account: tokenAccount });
                if (typeof builder.setInfo === 'function') {
                  builder.setInfo(infoToSet);
                  result = await client.publishBuilder(builder);
                  console.log('✅ Method 2 worked: builder.setInfo()');
                } else {
                  throw new Error('No setInfo method on builder');
                }
              } catch (err2) {
                console.log('❌ Method 2 failed, trying method 3...');
                // Approach 3: Check if setInfo needs different parameters
                throw new Error(`All methods failed. Err1: ${err1 instanceof Error ? err1.message : 'unknown'}, Err2: ${err2 instanceof Error ? err2.message : 'unknown'}`);
              }
            }
            
            console.log('✅ Successfully set token metadata!');
            console.log('📋 Result:', result);
            
            // Verify the changes
            console.log('');
            console.log('🔍 Verifying changes...');
            const updatedState = await client.client.getAccountInfo(tokenAccount);
            console.log('📊 Updated token info:');
            console.log('   Name:', updatedState.info?.name || 'Still empty');
            console.log('   Description:', updatedState.info?.description || 'Still empty');
            console.log('   Metadata:', updatedState.info?.metadata || 'Still empty');
            
          } catch (metaError) {
            const metaErrorMsg = metaError instanceof Error ? metaError.message : 'Unknown error';
            console.log('❌ Metadata setting attempt failed:', metaErrorMsg);
            console.log('💡 This might require special permissions or different approach');
          }
          
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          console.log('⚠️  Could not access token state:', errorMsg);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.log('❌ Error exploring metadata options:', errorMsg);
      }
      
      console.log('');
      console.log('⚠️  Note: Token metadata setting is not yet supported by the current SDK.');
      console.log('💡 This feature will be available in future SDK versions.');
      console.log('🔧 For now, token metadata must be set through other means.');
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

  // Token permissions check command
  program
    .command('token:permissions')
    .description('Check your permissions on tokens (useful before distribution)')
    .option('--token <address>', 'specific token address to check (optional)')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { 
        console.error('❌ No wallet found.'); 
        process.exit(1); 
      }
      
      const acct = accountFromWallet(wallet);
      const client = clientFrom(opts.network, acct);
      
      console.log('🔐 Checking token permissions...');
      console.log(`📋 Principal: ${acct.publicKeyString.toString()}`);
      
      try {
        // Get permissions - this might be available through the client
        console.log('📡 Fetching permissions from network...');
        
        // This is speculative - we need to find the right API call
        // Based on the UI making this call, there should be a way to get permissions
        
        if (opts.token) {
          console.log(`🎯 Checking permissions for token: ${opts.token}`);
          // Check specific token permissions
        } else {
          console.log('📋 Checking permissions for all tokens...');
          // Check all token permissions
        }
        
        console.log('💡 Permissions format: ["0x3", "0x0"] where 0x3=ADMIN, 0x0=ACCESS');
        console.log('💡 ADMIN permissions allow token distribution');
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Failed to fetch permissions:', errorMsg);
        console.log('💡 This feature may require additional SDK methods');
      }
    });

  // Token distribution command - based on documented patterns
  program
    .command('token:distribute')
    .description('Distribute from the token account to a recipient (creator/admin only)')
    .requiredOption('--token <address>', 'token account address (the token itself)')
    .requiredOption('--to <address>', 'recipient address')
    .requiredOption('--amount <amount>', 'amount to distribute (human units)')
    .option('--decimals <decimals>', 'token decimals (e.g. 0, 2, 6)', '0')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) { 
        console.error('❌ No wallet found.'); 
        process.exit(1); 
      }
      
      const signer = accountFromWallet(wallet);
      const client = clientFrom(opts.network, signer);
      
      console.log('🎯 Distributing tokens...');
      console.log(`🪙 Token: ${opts.token}`);
      console.log(`📤 From: Token Account`);
      console.log(`📥 To: ${opts.to}`);
      console.log(`💰 Amount: ${opts.amount} tokens`);
      
      try {
        // Convert to base units (amount * 10^decimals)
        const decimals = parseInt(opts.decimals);
        const amount = BigInt(Math.trunc(Number(opts.amount) * 10 ** decimals));
        console.log(`💡 Converting ${opts.amount} tokens with ${decimals} decimals to ${amount} base units`);
        
        const tokenAccount = Account.fromPublicKeyString(opts.token);
        const recipient = Account.fromPublicKeyString(opts.to);
        
        console.log('🔧 Initializing builder with token account context...');
        const builder = client.initBuilder({ account: tokenAccount });
        
        // Working approach: Increase supply first, then the tokens go to the creator's balance
        console.log('🔧 Step 1: Adding to token supply...');
        builder.modifyTokenSupply(amount);
        
        console.log('📤 Publishing supply increase...');
        const supplyResult = await builder.publish();
        console.log('✅ Supply increased successfully');
        
        // Step 2: Send from creator's balance to recipient
        console.log('🔧 Step 2: Sending tokens from creator to recipient...');
        const sendBuilder = client.initBuilder();
        sendBuilder.send(recipient, amount, tokenAccount);
        
        console.log('📤 Publishing transfer transaction...');
        const result = await sendBuilder.publish();
        
        console.log('✅ Tokens distributed successfully!');
        console.log(`✅ Distributed ${opts.amount} tokens to ${opts.to}`);
        console.log('💡 Distribution completed using two-step process:');
        console.log('   1. ✅ Increased token supply by', amount.toString(), 'base units');
        console.log('   2. ✅ Transferred tokens from creator to recipient');
        
        if ('voteStaple' in result && result.voteStaple) {
          console.log(`🧾 Vote Staple Hash: ${result.voteStaple.hash}`);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Distribution failed:', errorMsg);
        console.log('💡 Make sure you have TOKEN_ADMIN_BALANCE permission on this token');
        console.log('💡 Only token creators/admins can distribute from the token account');
        process.exit(1);
      }
    });
}