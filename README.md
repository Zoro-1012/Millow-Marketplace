# Millow

Tokenized real estate marketplace built with Solidity, Hardhat, React, and Ethers.js.

## Current state

- Local marketplace flow works end to end.
- The repo seeds 3 demo properties on deploy.
- Users can buy seeded properties and create new listings from the frontend.
- New custom listing metadata is still stored in browser local storage for demo purposes.
- There is no backend service in this repo yet.

## Stack

- Solidity
- Hardhat
- React
- Ethers.js

## Local development

1. Install dependencies

```bash
npm install
```

2. Start a local chain

```bash
npx hardhat node
```

3. Deploy contracts and update frontend addresses

```bash
npx hardhat run ./scripts/deploy.js --network localhost
```

Shortcuts:

```bash
npm run test:contracts
npm run deploy:local
```

4. Start the frontend

```bash
npm start
```

## Test commands

```bash
npx hardhat test
npm test -- --watchAll=false
npm run build
```

## Sepolia preparation

Copy `.env.example` to `.env` and fill in:

- `SEPOLIA_RPC_URL`
- `PRIVATE_KEY`
- `ETHERSCAN_API_KEY`
- `REACT_APP_CHAIN_ID`
- `REACT_APP_REALESTATE_ADDRESS`
- `REACT_APP_ESCROW_ADDRESS`

Deploy contracts:

```bash
npx hardhat run ./scripts/deploy.js --network sepolia
```

Then set the matching `REACT_APP_*` values in Vercel before deploying the frontend.

Shortcut:

```bash
npm run deploy:sepolia
```

## Deployment notes

- `scripts/deploy.js` writes local deploy addresses into [src/config.json](/Users/nipurngoyal/Documents/Projects/millow/src/config.json) for chain `31337`.
- The frontend prefers `REACT_APP_*` contract addresses when they are set and the wallet is on the matching chain.
- Before recording a public demo, replace local-storage metadata with IPFS or another public storage layer.
- A backend is optional for the current flow. Add one later only if you need indexing, notifications, auth, or admin APIs.
