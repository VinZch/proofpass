import fs from 'node:fs';
import solc from 'solc';
const input = {
  language: 'Solidity',
  sources: {
    'ProofPassRegistry.sol': {
      content: fs.readFileSync('contracts/ProofPassRegistry.sol', 'utf8'),
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'shanghai',
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
    },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const error of output.errors ?? []) {
  console.log(error.formattedMessage);
  if (error.severity === 'error') process.exitCode = 1;
}
if (process.exitCode) process.exit();
const c = output.contracts['ProofPassRegistry.sol'].ProofPassRegistry;
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/compiler-input.json', JSON.stringify(input, null, 2));
fs.writeFileSync(
  'artifacts/ProofPassRegistry.json',
  JSON.stringify(
    {
      compiler: solc.version(),
      abi: c.abi,
      bytecode: '0x' + c.evm.bytecode.object,
      runtimeBytecode: '0x' + c.evm.deployedBytecode.object,
    },
    null,
    2,
  ),
);
fs.writeFileSync('chain/abi.json', JSON.stringify(c.abi, null, 2));
fs.mkdirSync('chain/vendor', { recursive: true });
fs.copyFileSync('node_modules/ethers/dist/ethers.min.js', 'chain/vendor/ethers.js');
fs.copyFileSync('node_modules/ethers/LICENSE.md', 'chain/vendor/ethers-LICENSE.md');
console.log('Compiled ProofPassRegistry; ABI and locally bundled ethers ready.');
