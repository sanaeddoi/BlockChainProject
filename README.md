## Running the project

### Requirements
- Node.js
- Python 3 (for the off-chain storage module)

### 1. Install and build
```bash
npm install
npx hardhat build
```

### 2. Run the tests
```bash
npx hardhat test
```

### 3. Run the front end (local Hardhat network)

`hardhat.config.ts` must have a `localhost` network inside `networks`:
```ts
localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545" },
```

Use three terminals, all from the repo root.

**Terminal 1: start the local blockchain and leave it running**
```bash
npx hardhat node
```

**Terminal 2: deploy the contracts to it**
```bash
npx hardhat run scripts/deploy.ts --network localhost
```
The node prints a contract address for each deployment. Copy the four addresses
(ID_registery, Device_manager, Consent_manager, Data_sharing) into `frontend/config.js`.

**Terminal 3: serve the project**
```bash
npx serve .
```

Open `http://localhost:3000/frontend` in your browser. The dot at the top should turn green.

### Notes
- If you restart `npx hardhat node`, all contracts are wiped. Deploy again and
  update the addresses in `frontend/config.js`.
- The front end loads contract ABIs from `artifacts/`, so run `npx hardhat build`
  first and serve from the repo root.