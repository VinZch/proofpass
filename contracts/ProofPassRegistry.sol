// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
contract ProofPassRegistry {
    address public admin;
    mapping(address => bool) public issuers;
    struct Record { bytes32 commitment; uint64 registeredAt; uint64 validUntil; bool revoked; }
    mapping(address => mapping(bytes32 => Record)) private records;
    event IssuerSet(address indexed issuer, bool enabled);
    event Issued(address indexed issuer, bytes32 indexed id, bytes32 commitment, uint64 validUntil);
    event Revoked(address indexed issuer, bytes32 indexed id);
    constructor() { admin = msg.sender; }
    function setIssuer(address issuer, bool enabled) external {
        require(msg.sender == admin && issuer != address(0), "admin/zero");
        issuers[issuer] = enabled;
        emit IssuerSet(issuer, enabled);
    }
    function issue(bytes32 id, bytes32 commitment, uint64 validUntil) external {
        require(issuers[msg.sender] && id != 0 && commitment != 0, "issuer/empty");
        require(validUntil > block.timestamp && records[msg.sender][id].commitment == 0, "expiry/duplicate");
        records[msg.sender][id] = Record(commitment, uint64(block.timestamp), validUntil, false);
        emit Issued(msg.sender, id, commitment, validUntil);
    }
    function revoke(bytes32 id) external {
        require(issuers[msg.sender] && records[msg.sender][id].commitment != 0 && !records[msg.sender][id].revoked, "issuer/record");
        records[msg.sender][id].revoked = true;
        emit Revoked(msg.sender, id);
    }
    function getRecord(address issuer, bytes32 id) external view returns (Record memory) { return records[issuer][id]; }
}
