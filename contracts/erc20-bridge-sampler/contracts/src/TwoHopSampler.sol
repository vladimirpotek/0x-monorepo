/*

  Copyright 2019 ZeroEx Intl.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

*/

pragma solidity ^0.5.9;
pragma experimental ABIEncoderV2;


contract TwoHopSampler {
    struct TwoHopSourceOpts {
        bytes4 selector;
        bytes parameters;
    }

    function sampleTwoHopSell(
        TwoHopSourceOpts[] memory firstHopSources,
        TwoHopSourceOpts[] memory secondHopSources,
        uint256 sellAmount
    )
        public
        view
        returns (
            uint256 firstHopSourceIndex,
            uint256 secondHopSourceIndex,
            uint256 buyAmount
        )
    {
        uint256 intermediateAssetAmount = 0;
        for (uint256 i = 0; i != firstHopSources.length; ++i) {
            bytes memory quoteCalldata = abi.encodeWithSelector(
                firstHopSources[i].selector,
                firstHopSources[i].parameters,
                sellAmount
            );
            (bool didSucceed, bytes memory resultData) = address(this).staticcall(quoteCalldata);
            if (didSucceed) {
                uint256 amount = abi.decode(resultData, (uint256));
                if (amount > intermediateAssetAmount) {
                    intermediateAssetAmount = amount;
                    firstHopSourceIndex = i;
                }
            }
        }
        if (intermediateAssetAmount == 0) {
            return (firstHopSourceIndex, secondHopSourceIndex, buyAmount);
        }
        for (uint256 j = 0; j != secondHopSources.length; ++j) {
            bytes memory quoteCalldata = abi.encodeWithSelector(
                secondHopSources[j].selector,
                secondHopSources[j].parameters,
                intermediateAssetAmount
            );
            (bool didSucceed, bytes memory resultData) = address(this).staticcall(quoteCalldata);
            if (didSucceed) {
                uint256 amount = abi.decode(resultData, (uint256));
                if (amount > buyAmount) {
                    buyAmount = amount;
                    secondHopSourceIndex = j;
                }
            }
        }
    }

    function sampleTwoHopBuy(
        TwoHopSourceOpts[] memory firstHopSources,
        TwoHopSourceOpts[] memory secondHopSources,
        uint256 buyAmount
    )
        public
        view
        returns (
            uint256 firstHopSourceIndex,
            uint256 secondHopSourceIndex,
            uint256 sellAmount
        )
    {
        uint256 intermediateAssetAmount = 0;
        for (uint256 j = 0; j != secondHopSources.length; ++j) {
            bytes memory quoteCalldata = abi.encodeWithSelector(
                secondHopSources[j].selector,
                secondHopSources[j].parameters,
                buyAmount
            );
            (bool didSucceed, bytes memory resultData) = address(this).staticcall(quoteCalldata);
            if (didSucceed) {
                uint256 amount = abi.decode(resultData, (uint256));
                if (
                    intermediateAssetAmount == 0 ||
                    amount < intermediateAssetAmount
                ) {
                    intermediateAssetAmount = amount;
                    secondHopSourceIndex = j;
                }
            }
        }
        if (intermediateAssetAmount == 0) {
            return (firstHopSourceIndex, secondHopSourceIndex, sellAmount);
        }
        for (uint256 i = 0; i != firstHopSources.length; ++i) {
            bytes memory quoteCalldata = abi.encodeWithSelector(
                firstHopSources[i].selector,
                firstHopSources[i].parameters,
                intermediateAssetAmount
            );
            (bool didSucceed, bytes memory resultData) = address(this).staticcall(quoteCalldata);
            if (didSucceed) {
                uint256 amount = abi.decode(resultData, (uint256));
                if (
                    sellAmount == 0 ||
                    amount < sellAmount
                ) {
                    sellAmount = amount;
                    firstHopSourceIndex = i;
                }
            }
        }
    }
}
