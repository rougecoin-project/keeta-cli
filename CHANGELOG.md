# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2024-09-30

### ✨ Added
- **Token Distribution System**: Implemented working token distribution functionality
  - New `token:distribute` command for distributing tokens from creator to recipients
  - Two-step distribution process: supply increase + transfer for security
  - Support for decimal-aware token amounts
  - Comprehensive error handling and user feedback

### 🔧 Technical Implementation
- **Distribution Method**: Uses `modifyTokenSupply` + `builder.send` pattern
- **Permission System**: Requires TOKEN_ADMIN_SUPPLY permissions (creator only)
- **Amount Conversion**: Automatic conversion from human units to base units using decimals
- **Transaction Safety**: Two separate transactions for auditability

### 🎯 Token Management Features
- Create tokens with proper metadata display ✅
- Manage token supply (increase/decrease) ✅
- Distribute tokens to recipients ✅
- Send tokens between accounts ✅
- List all tokens with balances ✅
- Check token permissions ✅

### 📋 Command Reference

#### Token Distribution
```bash
# Distribute tokens from token account to recipient
node dist/cli.js token:distribute --token <token_address> --to <recipient_address> --amount <amount> --decimals <decimals>

# Example: Distribute 1000 tokens with 9 decimals
node dist/cli.js token:distribute --token keeta_abc123... --to keeta_def456... --amount 1000 --decimals 9
```

#### Other Token Commands
```bash
# Create a new token
node dist/cli.js token:create --name "My Token" --symbol "MTK" --supply 1000000 --decimals 9

# Send tokens (normal transfer)
node dist/cli.js send --token <token_address> --to <recipient> --amount <amount>

# Manage token supply
node dist/cli.js token:supply --token <token_address> --add <amount>

# List all tokens
node dist/cli.js tokens:list
```

### 🚨 Important Notes
- **Recipients must be user accounts**, not token accounts
- **Only token creators can distribute** (requires admin permissions)
- **Distribution increases total supply** (minting + sending pattern)
- **Two-step process** ensures transparency and auditability

### 🐛 Bug Fixes
- Fixed token distribution error handling
- Resolved `modifyTokenBalance` operation limitations
- Improved error messages for permission issues
- Added proper decimal conversion for all token operations

### 🔍 Technical Discoveries
- `modifyTokenBalance` operation not supported in current SDK version
- Token supply modifications automatically credit creator's balance
- Two-step distribution provides better security than direct balance modification
- Token accounts cannot receive tokens directly (only user accounts can)

### 📚 Documentation
- Comprehensive command help and examples
- Error message improvements with actionable guidance
- Implementation notes for SDK patterns
- Permission system documentation

---

## Previous Versions

### [0.1.0] - Initial Release
- Basic CLI structure with Commander.js
- Token creation functionality
- Wallet management
- Network connectivity (test/main)
- Basic token operations (send, supply management)