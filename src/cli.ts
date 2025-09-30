#!/usr/bin/env node

import { Command } from 'commander';
import { addWalletCommands } from './commands/wallet.js';
import { addAccountCommands } from './commands/account.js';
import { addTokenCommands } from './commands/tokens.js';

const program = new Command();

program
  .name('keeta')
  .description('Keeta CLI - Wallet management and network operations')
  .version('0.1.0');

// Add command modules
addWalletCommands(program);
addAccountCommands(program);
addTokenCommands(program);

// Debug command for development
program
  .command('wallet:debug')
  .description('Debug wallet and account information')
  .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
  .action(async (opts) => {
    const { loadWallet, defaultKeyfile, accountFromWallet } = await import('./lib/keeta.js');
    
    const keyfile = opts.keyfile || defaultKeyfile();
    const wallet = loadWallet(keyfile);
    
    if (!wallet) {
      console.error('No wallet found at:', keyfile);
      process.exit(1);
    }
    
    console.log('🔍 Wallet Debug Information:');
    console.log('📁 Keyfile:', keyfile);
    console.log('🌱 Seed:', wallet.seed ? `${wallet.seed.substring(0, 16)}...` : 'none');
    console.log('🔑 Algorithm:', wallet.algo || 'unknown');
    console.log('📊 Index:', wallet.index || 0);
    
    if (wallet.privateKeySecp256k1) {
      console.log('🔐 Has SECP256K1 Private Key');
    }
    
    try {
      const acct = accountFromWallet(wallet);
      console.log('✅ Account Address:', acct.publicKeyString.toString());
    } catch (error) {
      console.log('❌ Error creating account:', error);
    }
  });

// Parse command line arguments
program.parse();