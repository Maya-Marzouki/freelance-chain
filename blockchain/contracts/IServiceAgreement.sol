// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IServiceAgreement {
    enum Status { Created, Accepted, InProgress, Delivered, Completed, Cancelled, Disputed }

    struct Agreement {
        uint256 id;
        address client;
        address freelancer;
        string title;
        bytes32 termsHash;
        uint256 amount;
        uint256 deadline;
        Status status;
    }

    function getAgreement(uint256 id) external view returns (Agreement memory);
}