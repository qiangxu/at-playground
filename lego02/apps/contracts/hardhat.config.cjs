// hardhat.config.cjs
//require("dotenv/config");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");

/** @type import('hardhat/config').HardhatUserConfig */
const PK = (process.env.PRIVATE_KEY || "").replace(/^0x/, "");
module.exports = {
    solidity: {
        version: "0.8.26",
        settings: { optimizer: { enabled: true, runs: 200 } }
    },
    paths: { sources: "contracts" },
    networks: {
        hardhat: {},
        baseSepolia: {
            url: process.env.RPC_BASE_SEPOLIA || "",
            accounts: PK ? ["0x" + PK] : [],
            chainId: 84532
        },
        base: {
            url: process.env.RPC_BASE || "",
            accounts: PK ? ["0x" + PK] : [],
            chainId: 84532
        }
    }
};

