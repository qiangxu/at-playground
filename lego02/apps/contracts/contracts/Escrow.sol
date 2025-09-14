// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Escrow is Ownable {
    struct LockedLot {
        address token;      // 标的 token 地址
        address owner;      // 卖方地址
        uint256 amount;     // 剩余托管数量
        address quote;      // 报价币种, 例如 USDC, 也可为 address(0) 表示原生 ETH
        uint256 price;      // 单价, quote 的最小单位
        bool    active;     // 是否可交易
    }

    uint256 public nextLotId;
    mapping(uint256 => LockedLot) public lots; // lotId => LockedLot

    uint16 public feeBps;   // 手续费万分比
    address public feeTo;   // 手续费接收地址

    event Deposited(uint256 indexed lotId, address indexed owner, address indexed token, uint256 amount, address quote, uint256 price);
    event Withdrawn(uint256 indexed lotId, uint256 amount);
    event Taken(uint256 indexed lotId, address indexed taker, uint256 amount, uint256 pay);

    constructor(uint16 _feeBps, address _feeTo) Ownable(msg.sender) {
        feeBps = _feeBps;
        feeTo = _feeTo;
    }

    function setFee(uint16 _feeBps, address _feeTo) external onlyOwner {
        require(_feeBps <= 1000, "fee too high");
        feeBps = _feeBps;
        feeTo = _feeTo;
    }

    function deposit(address token, uint256 amount, address quote, uint256 price) external returns (uint256 lotId) {
        require(amount > 0 && price > 0, "bad params");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        lotId = ++nextLotId;
        lots[lotId] = LockedLot({ token: token, owner: msg.sender, amount: amount, quote: quote, price: price, active: true });
        emit Deposited(lotId, msg.sender, token, amount, quote, price);
    }

    function withdraw(uint256 lotId, uint256 amount) external {
        LockedLot storage L = lots[lotId];
        require(L.owner == msg.sender, "not owner");
        require(L.active, "inactive");
        require(amount <= L.amount, "exceed");
        L.amount -= amount;
        IERC20(L.token).transfer(msg.sender, amount);
        if (L.amount == 0) L.active = false;
        emit Withdrawn(lotId, amount);
    }

    function take(uint256 lotId, uint256 amount) external payable {
        LockedLot storage L = lots[lotId];
        require(L.active && amount > 0 && amount <= L.amount, "bad lot");
        uint256 pay = amount * L.price; // 简化: 不考虑小数安全, 前端负责单位
        uint256 fee = (pay * feeBps) / 10000;
        uint256 toSeller = pay - fee;

        if (L.quote == address(0)) {
            require(msg.value == pay, "bad eth");
            if (fee > 0) payable(feeTo).transfer(fee);
            payable(L.owner).transfer(toSeller);
        } else {
            IERC20(L.quote).transferFrom(msg.sender, address(this), pay);
            if (fee > 0) IERC20(L.quote).transfer(feeTo, fee);
            IERC20(L.quote).transfer(L.owner, toSeller);
        }

        L.amount -= amount;
        IERC20(L.token).transfer(msg.sender, amount);
        if (L.amount == 0) L.active = false;
        emit Taken(lotId, msg.sender, amount, pay);
    }
}