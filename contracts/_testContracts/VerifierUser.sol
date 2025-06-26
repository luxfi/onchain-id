/* solhint-disable */

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import { Verifier } from "../verifiers/Verifier.sol";

contract VerifierUser is Verifier {

    function doSomething() onlyVerifiedSender public {}
}
