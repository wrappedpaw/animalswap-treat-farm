import { writeJSONToFile } from './helpers/files'
import { Contract } from '@ethersproject/contracts'

// Encode Timelock Transactions
import MasterAnimal from '../build/contracts/MasterAnimal.json'
import Timelock from '../build/contracts/Timelock.json'


const DEFAULT_OFFSET = 3600 * 6.5;
const getTimestamp = (offsetSeconds = 0): number => {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return currentTimestamp + offsetSeconds;
}

/*
 * TESTNET or MAINNET? 
 */
// TESTNET
// const MASTER_ANIMAL_ADDRESS = '0xbbC5e1cD3BA8ED639b00927115e5f0e0040aA613';
// const TIMELOCK_ADDRESS = '0xA350F1e2e7ca4d1f5032a8C73f8543Db031A6D51';
// MAINNET 
const MASTER_ANIMAL_ADDRESS = '0x5c8D727b265DBAfaba67E050f2f739cAeEB4A6F9';
const TIMELOCK_ADDRESS = '0x2F07969090a2E9247C761747EA2358E5bB033460';
const TRANSFER_OWNERSHIP_TO = '';

// const masterAnimalContract = new Contract(MASTER_ANIMAL_ADDRESS, MasterAnimal.abi);
const ownershipContract = new Contract(MASTER_ANIMAL_ADDRESS, MasterAnimal.abi);
const timelockContract = new Contract(TIMELOCK_ADDRESS, Timelock.abi);

const encode = async () => {    
    /**
     * transferOwnership 
     */
    const ETA = getTimestamp(DEFAULT_OFFSET);
    const method = 'transferOwnership';
    const masterAnimalTXEncodeFunction = ownershipContract.populateTransaction[method];
    const masterAnimalArgsArray = [
        [ TRANSFER_OWNERSHIP_TO ],
    ]

    let outputs = [];

    for (const masterAnimalArgs of masterAnimalArgsArray) {
        /**
     * Encode child tx
     */
        const masterAnimalTXEncoded = await masterAnimalTXEncodeFunction(...masterAnimalArgs);

        // TODO: Update encode to use signature
        // queueTransaction(address target, uint value, string memory signature, bytes memory data, uint eta)
        const timelockQueueEncoded = await timelockContract.populateTransaction
            .queueTransaction(
                MASTER_ANIMAL_ADDRESS,
                0,
                '',
                masterAnimalTXEncoded.data,
                ETA
            )

        // executeTransaction(address target, uint value, string memory signature, bytes memory data, uint eta) public payable returns (bytes memory)
        const timelockExecuteEncoded = await timelockContract.populateTransaction
            .executeTransaction(
                MASTER_ANIMAL_ADDRESS,
                0,
                '',
                masterAnimalTXEncoded.data,
                ETA
            )

        // cancelTransaction(address target, uint value, string memory signature, bytes memory data, uint eta)
        const timelockCancelEncoded = await timelockContract.populateTransaction
            .cancelTransaction(
                MASTER_ANIMAL_ADDRESS,
                0,
                '',
                masterAnimalTXEncoded.data,
                ETA
            )

        const output = {
            'ETA-Timestamp': ETA,
            'Date': new Date(ETA * 1000),
            queueTx: "",
            executeTx: "",
            cancelTx: "",
            masterAnimalTXEncodeFunction: method,
            masterAnimalArgs,
            masterAnimalTXEncoded,
            timelockQueueEncoded,
            timelockExecuteEncoded,
            timelockCancelEncoded
        }

        outputs.push(output);
    }



    console.dir(outputs);
    await writeJSONToFile('./scripts/encode-output.json', outputs);
}

encode().then(() => {
    console.log('Done encoding!');
})
