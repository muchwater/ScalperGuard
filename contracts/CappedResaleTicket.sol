// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * CappedResaleTicket
 * - 전송 쿨다운
 * - 이벤트 시작 임박 전송 차단
 * - KYC/PoP allowlist 강제
 * - (옵션) 가격상한은 마켓 통합 시 on-chain 체크 또는 off-chain attestation로 검증
 */
contract CappedResaleTicket is ERC721, Ownable, Pausable {
    uint256 public faceValue;              // 정가 (wei)
    uint256 public eventStart;             // 공연 시작 타임스탬프 (epoch seconds)
    uint256 public cooldownSec;            // 전송 쿨다운 (초)
    uint256 public blockBeforeStartSec;    // 공연 시작 전 전송금지 구간 (초)

    mapping(uint256 => uint256) public lastTransferAt; // tokenId -> last transfer ts
    mapping(address => bool) public allowedKYC;        // PoP/KYC 통과 주소
    mapping(uint256 => uint256) public mintAt;         // tokenId -> mint ts

    uint256 private _nextTokenId;

    event KYCUpdated(address indexed user, bool allowed);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 faceValue_,
        uint256 eventStart_,
        uint256 cooldownSec_,
        uint256 blockBeforeStartSec_
    ) ERC721(name_, symbol_) {
        faceValue = faceValue_;
        eventStart = eventStart_;
        cooldownSec = cooldownSec_;
        blockBeforeStartSec = blockBeforeStartSec_;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setKYC(address user, bool ok) external onlyOwner {
        allowedKYC[user] = ok;
        emit KYCUpdated(user, ok);
    }

    function batchSetKYC(address[] calldata users, bool ok) external onlyOwner {
        for (uint256 i=0; i<users.length; i++) {
            allowedKYC[users[i]] = ok;
            emit KYCUpdated(users[i], ok);
        }
    }

    function safeMint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        mintAt[tokenId] = block.timestamp;
        lastTransferAt[tokenId] = block.timestamp;
    }

    function _update(address to, uint256 tokenId, address auth) internal override whenNotPaused returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            // 전송 시만 검사 (mint 제외)
            require(block.timestamp + blockBeforeStartSec < eventStart, "Near event blocked");
            require(block.timestamp - lastTransferAt[tokenId] >= cooldownSec, "Cooldown");
            require(allowedKYC[from] && allowedKYC[to], "KYC/PoP required");
        }
        lastTransferAt[tokenId] = block.timestamp;
        return super._update(to, tokenId, auth);
    }
}