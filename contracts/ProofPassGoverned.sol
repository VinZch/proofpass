// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// Separate registry: does not migrate or mutate the existing 29-line registry.
contract ProofPassGoverned {
    struct Institution { address key; uint64 epoch; uint64 revision; bool enabled; }
    struct Record {
        bytes32 commitment; uint64 registeredAt; uint64 validUntil;
        address issuedBy; uint64 keyEpoch;
        bytes32 previousId; bytes32 replacedBy;
        uint64 revokedAt; uint8 revocationKind; bytes32 reasonHash;
    }
    enum Action { Register, Rotate, SetEnabled, EmergencyRevoke }
    struct Proposal {
        Action action; bytes32 institution; address key; bool enabled;
        bytes32 credentialId; bytes32 reasonHash; uint64 revision;
        uint64 deadline; uint8 approvals; bool executed; bool cancelled;
    }
    mapping(address => bool) public governors;
    address[] public governorList;
    uint8 public threshold;
    mapping(bytes32 => Institution) public institutions;
    // A retired key cannot be re-used, including by another institution.
    mapping(address => bytes32) public keyInstitution;
    mapping(bytes32 => mapping(bytes32 => Record)) private records;
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public approved;

    event Proposed(uint256 indexed proposalId, bytes32 indexed institution, Action action, address proposer);
    event Approved(uint256 indexed proposalId, address indexed governor);
    event Executed(uint256 indexed proposalId);
    event Cancelled(uint256 indexed proposalId);
    event InstitutionChanged(bytes32 indexed institution, address key, uint64 epoch, bool enabled);
    event Issued(bytes32 indexed institution, bytes32 indexed id, address indexed issuer, bytes32 commitment);
    event Revoked(bytes32 indexed institution, bytes32 indexed id, uint8 kind, bytes32 reasonHash);
    event Corrected(bytes32 indexed institution, bytes32 indexed oldId, bytes32 indexed newId);

    modifier onlyGovernor() { require(governors[msg.sender], "governor"); _; }
    modifier onlyIssuer(bytes32 institution) {
        Institution storage org = institutions[institution];
        require(org.enabled && org.key == msg.sender, "active issuer"); _;
    }
    constructor(address[] memory owners, uint8 required) {
        require(owners.length == 3 && required == 2, "threshold");
        for (uint256 i; i < owners.length; ++i) {
            require(owners[i] != address(0) && !governors[owners[i]], "owner");
            governors[owners[i]] = true; governorList.push(owners[i]);
        }
        threshold = required;
    }
    function propose(Action action, bytes32 institution, address key, bool enabled, bytes32 credentialId, bytes32 reasonHash, uint64 deadline)
        external onlyGovernor returns (uint256 id)
    {
        require(institution != 0 && reasonHash != 0, "empty");
        require(deadline > block.timestamp && deadline <= block.timestamp + 7 days, "deadline");
        Institution storage org = institutions[institution];
        require(action == Action.Register ? org.key == address(0) : org.key != address(0), "institution");
        // Canonical action fields avoid misleading unused parameters in proposals.
        if (action == Action.Register || action == Action.Rotate) {
            require(key != address(0) && keyInstitution[key] == 0 && !enabled && credentialId == 0, "key/fields");
        } else if (action == Action.SetEnabled) {
            require(key == address(0) && credentialId == 0, "fields");
        } else {
            require(key == address(0) && !enabled && credentialId != 0, "fields");
        }
        id = ++proposalCount;
        proposals[id] = Proposal(action, institution, key, enabled, credentialId, reasonHash, org.revision, deadline, 1, false, false);
        approved[id][msg.sender] = true;
        emit Proposed(id, institution, action, msg.sender); emit Approved(id, msg.sender);
    }
    function _pending(uint256 id) private view {
        Proposal storage p = proposals[id];
        require(id != 0 && id <= proposalCount && !p.executed && !p.cancelled && p.deadline > block.timestamp, "not pending");
        require(p.revision == institutions[p.institution].revision, "stale proposal");
    }
    function approve(uint256 id) external onlyGovernor {
        _pending(id); require(!approved[id][msg.sender], "already approved");
        approved[id][msg.sender] = true; ++proposals[id].approvals; emit Approved(id, msg.sender);
    }
    // Any governor may veto a pending proposal. This intentionally favors safety over availability.
    function cancel(uint256 id) external onlyGovernor {
        _pending(id); proposals[id].cancelled = true; emit Cancelled(id);
    }
    function execute(uint256 id) external onlyGovernor {
        _pending(id); Proposal storage p = proposals[id];
        require(p.approvals >= threshold, "threshold"); p.executed = true;
        Institution storage org = institutions[p.institution];
        if (p.action == Action.Register || p.action == Action.Rotate) {
            require(p.key != address(0) && keyInstitution[p.key] == 0, "used key");
            keyInstitution[p.key] = p.institution;
            org.key = p.key; ++org.epoch;
            // Rotation never silently re-enables a suspended institution.
            if (p.action == Action.Register) org.enabled = true;
        } else if (p.action == Action.SetEnabled) {
            org.enabled = p.enabled;
        } else {
            _revoke(p.institution, p.credentialId, 3, p.reasonHash);
        }
        ++org.revision;
        emit InstitutionChanged(p.institution, org.key, org.epoch, org.enabled); emit Executed(id);
    }
    function _issue(bytes32 institution, bytes32 id, bytes32 commitment, uint64 validUntil, bytes32 previousId) private {
        require(id != 0 && commitment != 0 && validUntil > block.timestamp, "empty/expiry");
        require(records[institution][id].commitment == 0, "duplicate");
        Record storage r = records[institution][id];
        r.commitment = commitment; r.registeredAt = uint64(block.timestamp); r.validUntil = validUntil;
        r.issuedBy = msg.sender; r.keyEpoch = institutions[institution].epoch; r.previousId = previousId;
        emit Issued(institution, id, msg.sender, commitment);
    }
    function issue(bytes32 institution, bytes32 id, bytes32 commitment, uint64 validUntil) external onlyIssuer(institution) {
        _issue(institution, id, commitment, validUntil, 0);
    }
    function _revoke(bytes32 institution, bytes32 id, uint8 kind, bytes32 reasonHash) private {
        Record storage r = records[institution][id];
        require(r.commitment != 0 && r.revocationKind == 0 && reasonHash != 0, "record/reason");
        r.revokedAt = uint64(block.timestamp); r.revocationKind = kind; r.reasonHash = reasonHash;
        emit Revoked(institution, id, kind, reasonHash);
    }
    function revoke(bytes32 institution, bytes32 id, bytes32 reasonHash) external onlyIssuer(institution) {
        _revoke(institution, id, 1, reasonHash);
    }
    function correct(bytes32 institution, bytes32 oldId, bytes32 newId, bytes32 commitment, uint64 validUntil, bytes32 reasonHash)
        external onlyIssuer(institution)
    {
        _revoke(institution, oldId, 2, reasonHash);
        _issue(institution, newId, commitment, validUntil, oldId);
        records[institution][oldId].replacedBy = newId;
        emit Corrected(institution, oldId, newId);
    }
    function getRecord(bytes32 institution, bytes32 id) external view returns (Record memory) { return records[institution][id]; }
}
