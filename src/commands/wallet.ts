import { Command } from 'commander';
import { loadWallet, saveWallet, defaultKeyfile, accountFromWallet, Wallet } from '../lib/keeta.js';
import { readOnlyClientFrom, clientFrom, asAccount } from '../lib/keeta.js';
import { lib } from '@keetanetwork/keetanet-client';

const { Account } = lib;
const { AccountKeyAlgorithm } = Account;

function getKeyfile(opts: any): string {
  return opts.keyfile || defaultKeyfile();
}

export function addWalletCommands(program: Command): void {
  program
    .command('wallet:new')
    .description('Generate a new wallet')
    .option('--algo <type>', 'key algorithm: ed25519, secp256k1, secp256r1', 'ed25519')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const algo = opts.algo.toLowerCase();
      if (!['ed25519', 'secp256k1', 'secp256r1'].includes(algo)) {
        console.error('Invalid algorithm. Use ed25519, secp256k1, or secp256r1');
        process.exit(1);
      }

      const seed = Account.generateRandomSeed();
      const wallet: Wallet = { seed: seed.toString(), algo: algo as any };
      const keyfile = getKeyfile(opts);
      saveWallet(wallet, keyfile);
      
      const acct = accountFromWallet(wallet);
      console.log('✅ New wallet created!');
      console.log('🆔 Address:', acct.publicKeyString.toString());
      console.log('📁 Saved to:', keyfile);
    });

  program
    .command('wallet:import')
    .description('Import wallet from seed or mnemonic')
    .option('--seed <hex>', 'hex seed (0x...)')
    .option('--priv <hex>', 'secp256k1 private key (0x...)')
    .option('--mnemonic <words>', '24-word mnemonic phrase')
    .option('--algo <type>', 'key algorithm: ed25519, secp256k1, secp256r1', 'ed25519')
    .option('--index <n>', 'derivation index (for mnemonic)', '0')
    .option('--auto-detect', 'automatically find derivation with balance (for mnemonic only)')
    .option('--network <net>', 'network to check for balance (default: test)', 'test')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      if (!opts.seed && !opts.priv && !opts.mnemonic) {
        console.error('Must provide --seed, --priv, or --mnemonic');
        process.exit(1);
      }

      let wallet: Wallet;
      const algo = opts.algo.toLowerCase();

      if (opts.mnemonic) {
        const mnemonic = opts.mnemonic.trim();
        const words = mnemonic.split(/\s+/);
        if (words.length !== 24) {
          console.error('Mnemonic must be exactly 24 words');
          process.exit(1);
        }

        if (opts.autoDetect) {
          console.log('🔍 Auto-detecting wallet with balance...');
          console.log(`🌐 Checking network: ${opts.network}`);
          console.log('');

          const algorithms = ['ed25519', 'secp256k1', 'secp256r1'];
          const indices = [0, 1, 2, 3, 4, 5];
          let foundWallet: Wallet | null = null;
          let maxBalance = BigInt(0);
          let foundAddress = '';

          for (const testAlgo of algorithms) {
            console.log(`🔑 Testing ${testAlgo}...`);
            for (const index of indices) {
              try {
                const seed = await Account.seedFromPassphrase(mnemonic, { asString: true });
                const testWallet: Wallet = { seed: seed as string, index, algo: testAlgo as any };
                const acct = accountFromWallet(testWallet);
                const address = acct.publicKeyString.toString();
                
                // Check balance on the network
                const { clientFrom } = await import('../lib/keeta.js');
                const client = clientFrom(opts.network, acct);
                
                try {
                  const balances = await client.allBalances();
                  const balanceCount = Object.keys(balances).length;
                  
                  // Calculate total balance value (rough estimate)
                  let totalBalance = BigInt(0);
                  for (const [tokenId, balanceData] of Object.entries(balances)) {
                    const tokenInfo = JSON.parse(JSON.stringify(balanceData, (k, v) => typeof v === 'bigint' ? v.toString() : v));
                    totalBalance += BigInt(tokenInfo.balance || 0);
                  }
                  
                  if (balanceCount > 0) {
                    console.log(`   ✅ Index ${index}: ${address.substring(0, 20)}... (${balanceCount} tokens, balance: ${totalBalance.toString()})`);
                    
                    // Choose the wallet with the most balance
                    if (totalBalance > maxBalance) {
                      maxBalance = totalBalance;
                      foundWallet = testWallet;
                      foundAddress = address;
                    }
                  } else {
                    console.log(`   ❌ Index ${index}: ${address.substring(0, 20)}... (no balance)`);
                  }
                } catch (balanceError) {
                  console.log(`   ⚠️  Index ${index}: ${address.substring(0, 20)}... (network error)`);
                }
              } catch (error) {
                console.log(`   ❌ Index ${index}: Error - ${error}`);
              }
            }
            console.log('');
          }

          if (foundWallet) {
            wallet = foundWallet;
            console.log('🎉 Auto-detection successful!');
            console.log(`📍 Selected: ${foundWallet.algo} algorithm, index ${foundWallet.index}`);
            console.log(`🆔 Address: ${foundAddress}`);
            console.log(`💰 Total balance: ${maxBalance.toString()}`);
          } else {
            console.log('❌ No wallet with balance found on this network');
            console.log('💡 Try a different network or import manually with specific index');
            process.exit(1);
          }
        } else {
          console.log('🧠 Importing from 24-word mnemonic...');
          console.log(`🔢 Using derivation index: ${opts.index}`);
          console.log(`🔑 Algorithm: ${algo}`);

          const seed = await Account.seedFromPassphrase(mnemonic, { asString: true });
          wallet = { seed: seed as string, index: parseInt(opts.index), algo: algo as any };
        }
      } else if (opts.seed) {
        const seedHex = opts.seed.startsWith('0x') ? opts.seed.slice(2) : opts.seed;
        wallet = { seed: seedHex, algo: algo as any };
      } else if (opts.priv) {
        if (algo !== 'secp256k1') {
          console.error('Private key import only supports secp256k1');
          process.exit(1);
        }
        const privHex = opts.priv.startsWith('0x') ? opts.priv.slice(2) : opts.priv;
        wallet = { privateKeySecp256k1: privHex, algo: algo as any };
      } else {
        throw new Error('No import method specified');
      }

      const keyfile = getKeyfile(opts);
      saveWallet(wallet, keyfile);

      const acct = accountFromWallet(wallet);
      console.log('');
      console.log('✅ Wallet imported successfully!');
      console.log('🆔 Address:', acct.publicKeyString.toString());
      console.log('📁 Saved to:', keyfile);
      
      if (opts.mnemonic && opts.autoDetect) {
        console.log('');
        console.log('💡 Run "keeta balance" to see your tokens!');
      }
    });

  program
    .command('wallet:address')
    .description('Show wallet address')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) {
        console.error('No wallet found.');
        process.exit(1);
      }
      const acct = accountFromWallet(wallet);
      console.log(acct.publicKeyString.toString());
    });

  program
    .command('wallet:export')
    .description('Export wallet seed/private key (DANGEROUS!)')
    .option('--keyfile <path>', 'keystore file path', '~/.keeta/wallet.json')
    .action(async (opts) => {
      const wallet = loadWallet(getKeyfile(opts));
      if (!wallet) {
        console.error('No wallet found.');
        process.exit(1);
      }
      console.log('⚠️  WARNING: Never share these values!');
      if (wallet.seed) {
        console.log('🌱 Seed:', wallet.seed);
      }
      if (wallet.privateKeySecp256k1) {
        console.log('🔑 Private Key:', wallet.privateKeySecp256k1);
      }
      console.log('🔧 Algorithm:', wallet.algo);
    });

  program
    .command('wallet:test-derivations')
    .description('Test mnemonic derivations to find correct wallet')
    .requiredOption('--mnemonic <words>', '24-word mnemonic phrase')
    .action(async (opts) => {
      const mnemonic = opts.mnemonic.trim();
      const words = mnemonic.split(/\s+/);
      if (words.length !== 24) {
        console.error('Mnemonic must be exactly 24 words');
        process.exit(1);
      }

      console.log('🔍 Testing derivation paths...');
      console.log('');

      const algorithms = ['ed25519', 'secp256k1', 'secp256r1'];
      const indices = [0, 1, 2, 3, 4, 5];

      for (const algo of algorithms) {
        console.log(`🔑 Algorithm: ${algo}`);
        for (const index of indices) {
          try {
            const seed = await Account.seedFromPassphrase(mnemonic, { asString: true });
            const wallet: Wallet = { seed: seed as string, index, algo: algo as any };
            const acct = accountFromWallet(wallet);
            console.log(`   Index ${index}: ${acct.publicKeyString.toString()}`);
          } catch (error) {
            console.log(`   Index ${index}: Error - ${error}`);
          }
        }
        console.log('');
      }
    });

  program
    .command('wallet:scan-balances')
    .description('Scan balances for derived accounts from a mnemonic or current wallet seed')
    .option('--mnemonic <words>', '24-word mnemonic phrase (optional; uses current wallet if omitted)')
    .option('--algos <list>', 'comma-separated list of algos to scan: ed25519,secp256k1,secp256r1 (default: current wallet algo or ed25519)', '')
    .option('--start <n>', 'start derivation index (inclusive)', '0')
    .option('--end <n>', 'end derivation index (inclusive)', '10')
    .option('--network <net>', 'network: test or main', 'test')
    .option('--verbose', 'print zero-balance accounts too')
    .option('--keyfile <path>', 'keystore file path (used if --mnemonic not provided)', '~/.keeta/wallet.json')
    .action(async (opts) => {
      let seedHex: string | null = null;
      let defaultAlgo: string | null = null;

      if (opts.mnemonic) {
        const mnemonic = String(opts.mnemonic).trim();
        const words = mnemonic.split(/\s+/);
        if (words.length !== 24) {
          console.error('Mnemonic must be exactly 24 words');
          process.exit(1);
        }
        const seed = await Account.seedFromPassphrase(mnemonic, { asString: true });
        seedHex = seed as string;
        defaultAlgo = 'ed25519';
      } else {
        const wallet = loadWallet(defaultKeyfile());
        if (!wallet || (!wallet.seed && !wallet.privateKeySecp256k1)) {
          console.error('No wallet seed found. Provide --mnemonic or create/import a wallet first.');
          process.exit(1);
        }
        if (wallet.privateKeySecp256k1) {
          console.error('Scanning requires a seed-based wallet. Private key import cannot derive indices.');
          process.exit(1);
        }
        seedHex = wallet.seed!;
        defaultAlgo = wallet.algo || 'ed25519';
      }

      const start = parseInt(opts.start);
      const end = parseInt(opts.end);
      if (isNaN(start) || isNaN(end) || start < 0 || end < start) {
        console.error('Invalid range. Use --start N --end M with 0 <= N <= M');
        process.exit(1);
      }

      // Determine algorithms to scan
      let algos: string[];
      if (opts.algos) {
        algos = String(opts.algos).split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
      } else {
        algos = [defaultAlgo!];
      }
      const validAlgos = new Set(['ed25519', 'secp256k1', 'secp256r1']);
      for (const a of algos) {
        if (!validAlgos.has(a)) {
          console.error(`Invalid algo: ${a}. Use ed25519,secp256k1,secp256r1`);
          process.exit(1);
        }
      }

      console.log(`🔎 Scanning balances on ${opts.network} for indices ${start}..${end} across algos: ${algos.join(', ')}`);
      console.log('');

      const found: Array<{ algo: string; index: number; address: string; balances: Record<string, string> | Array<any> }>= [];
      const client = readOnlyClientFrom(opts.network);

      for (const algo of algos) {
        for (let index = start; index <= end; index++) {
          try {
            const wallet: Wallet = { seed: seedHex!, index, algo: algo as any };
            const acct = accountFromWallet(wallet);
            const address = acct.publicKeyString.toString();
            const info = await client.client.getAccountInfo(acct);
            const balances = info.balances || {};

            const count = Array.isArray(balances) ? balances.length : Object.keys(balances).length;
            if (count > 0 || opts.verbose) {
              console.log(`📄 ${algo} [${index}] ${address}`);
              if (count === 0) {
                console.log('   💰 No balances');
              } else {
                // Print a compact summary; names can be fetched via extra calls, skip for speed
                if (Array.isArray(balances)) {
                  for (const entry of balances as any[]) {
                    if (Array.isArray(entry) && entry.length >= 2) {
                      console.log(`   🪙 ${String(entry[0]).substring(0,12)}...: ${entry[1]}`);
                    } else if (entry && typeof entry === 'object') {
                      const tokenAddr = (entry as any).token || (entry as any).address || (entry as any).id || 'unknown';
                      const bal = (entry as any).balance || (entry as any).amount || 0;
                      console.log(`   🪙 ${String(tokenAddr).substring(0,12)}...: ${bal}`);
                    }
                  }
                } else {
                  for (const [tokenAddr, bal] of Object.entries(balances as Record<string, any>)) {
                    console.log(`   🪙 ${tokenAddr.substring(0,12)}...: ${String(bal)}`);
                  }
                }
              }
              found.push({ algo, index, address, balances });
            }
          } catch (err) {
            console.log(`⚠️  ${algo} [${index}] network error`);
          }
        }
      }

      console.log('');
      console.log(`✅ Scan complete. Matches with balances: ${found.length}`);
      if (found.length > 0) {
        console.log('');
        console.log('Top results:');
        for (const f of found.slice(0, 10)) {
          const count = Array.isArray(f.balances) ? f.balances.length : Object.keys(f.balances).length;
          console.log(` • ${f.algo} [${f.index}] ${f.address.substring(0,24)}... — ${count} token(s)`);
        }
      }
    });
}