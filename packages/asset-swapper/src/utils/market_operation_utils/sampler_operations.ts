import { ERC20BridgeSamplerContract } from '@0x/contracts-erc20-bridge-sampler';
import * as _ from 'lodash';

import { BigNumber, ERC20BridgeSource, SignedOrder } from '../..';

import { BalancerPoolsCache, computeBalancerBuyQuote, computeBalancerSellQuote } from './balancer_utils';
import { getCurveInfosForPair } from './curve_utils';
import { getMultiBridgeIntermediateToken } from './multibridge_utils';
import {
    BalancerFillData,
    BatchedOperation,
    CurveFillData,
    CurveInfo,
    DexSample,
    LiquidityProviderFillData,
    SamplerContractOperation,
    SourceQuoteOperation,
    UniswapV2FillData,
} from './types';

// tslint:disable:no-inferred-empty-object-type

/**
 * Composable operations that can be batched in a single transaction,
 * for use with `DexOrderSampler.executeAsync()`.
 */
export class SamplerOperations {
    private static _constant<T>(result: T): BatchedOperation<T> {
        return {
            encodeCall: () => {
                return '0x';
            },
            handleCallResultsAsync: async _callResults => {
                return result;
            },
        };
    }

    constructor(
        protected readonly _samplerContract: ERC20BridgeSamplerContract,
        public readonly balancerPoolsCache: BalancerPoolsCache = new BalancerPoolsCache(),
    ) {}

    public getOrderFillableTakerAmounts(orders: SignedOrder[], devUtilsAddress: string): BatchedOperation<BigNumber[]> {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Native,
            this._samplerContract.getOrderFillableTakerAssetAmounts,
            [orders, orders.map(o => o.signature), devUtilsAddress],
        );
    }

    public getOrderFillableMakerAmounts(orders: SignedOrder[], devUtilsAddress: string): BatchedOperation<BigNumber[]> {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Native,
            this._samplerContract.getOrderFillableMakerAssetAmounts,
            [orders, orders.map(o => o.signature), devUtilsAddress],
        );
    }

    public getKyberSellQuotes(
        makerToken: string,
        takerToken: string,
        takerFillAmounts: BigNumber[],
    ): SourceQuoteOperation {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Kyber,
            this._samplerContract.sampleSellsFromKyberNetwork,
            [takerToken, makerToken, takerFillAmounts],
        );
    }

    public getKyberBuyQuotes(
        makerToken: string,
        takerToken: string,
        makerFillAmounts: BigNumber[],
    ): SourceQuoteOperation {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Kyber,
            this._samplerContract.sampleBuysFromKyberNetwork,
            [takerToken, makerToken, makerFillAmounts],
        );
    }

    public getUniswapSellQuotes(
        makerToken: string,
        takerToken: string,
        takerFillAmounts: BigNumber[],
    ): SourceQuoteOperation {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Uniswap,
            this._samplerContract.sampleSellsFromUniswap,
            [takerToken, makerToken, takerFillAmounts],
        );
    }

    public getUniswapBuyQuotes(
        makerToken: string,
        takerToken: string,
        makerFillAmounts: BigNumber[],
    ): SourceQuoteOperation {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Uniswap,
            this._samplerContract.sampleBuysFromUniswap,
            [takerToken, makerToken, makerFillAmounts],
        );
    }

    public getUniswapV2SellQuotes(
        tokenAddressPath: string[],
        takerFillAmounts: BigNumber[],
    ): SourceQuoteOperation<UniswapV2FillData> {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.UniswapV2,
            this._samplerContract.sampleSellsFromUniswapV2,
            [tokenAddressPath, takerFillAmounts],
            { tokenAddressPath },
        );
    }

    public getUniswapV2BuyQuotes(
        tokenAddressPath: string[],
        makerFillAmounts: BigNumber[],
    ): SourceQuoteOperation<UniswapV2FillData> {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.UniswapV2,
            this._samplerContract.sampleBuysFromUniswapV2,
            [tokenAddressPath, makerFillAmounts],
            { tokenAddressPath },
        );
    }

    public getLiquidityProviderSellQuotes(
        registryAddress: string,
        makerToken: string,
        takerToken: string,
        takerFillAmounts: BigNumber[],
    ): SourceQuoteOperation<LiquidityProviderFillData> {
        const op = new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.LiquidityProvider,
            this._samplerContract.sampleSellsFromLiquidityProviderRegistry,
            [registryAddress, takerToken, makerToken, takerFillAmounts],
            {} as LiquidityProviderFillData, // tslint:disable-line:no-object-literal-type-assertion
            async (callResults: string): Promise<BigNumber[]> => {
                const [samples, poolAddress] = this._samplerContract.getABIDecodedReturnData<[BigNumber[], string]>(
                    'sampleSellsFromLiquidityProviderRegistry',
                    callResults,
                );
                op.fillData.poolAddress = poolAddress;
                return Promise.resolve(samples);
            },
        );
        return op;
    }

    public getLiquidityProviderBuyQuotes(
        registryAddress: string,
        makerToken: string,
        takerToken: string,
        makerFillAmounts: BigNumber[],
    ): SourceQuoteOperation<LiquidityProviderFillData> {
        const op = new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.LiquidityProvider,
            this._samplerContract.sampleBuysFromLiquidityProviderRegistry,
            [registryAddress, takerToken, makerToken, makerFillAmounts],
            {} as LiquidityProviderFillData, // tslint:disable-line:no-object-literal-type-assertion
            async (callResults: string): Promise<BigNumber[]> => {
                const [samples, poolAddress] = this._samplerContract.getABIDecodedReturnData<[BigNumber[], string]>(
                    'sampleBuysFromLiquidityProviderRegistry',
                    callResults,
                );
                op.fillData.poolAddress = poolAddress;
                return Promise.resolve(samples);
            },
        );
        return op;
    }

    public getMultiBridgeSellQuotes(
        multiBridgeAddress: string,
        makerToken: string,
        intermediateToken: string,
        takerToken: string,
        takerFillAmounts: BigNumber[],
    ): SourceQuoteOperation {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.MultiBridge,
            this._samplerContract.sampleSellsFromMultiBridge,
            [multiBridgeAddress, takerToken, intermediateToken, makerToken, takerFillAmounts],
        );
    }

    public getEth2DaiSellQuotes(
        makerToken: string,
        takerToken: string,
        takerFillAmounts: BigNumber[],
    ): SourceQuoteOperation {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Eth2Dai,
            this._samplerContract.sampleSellsFromEth2Dai,
            [takerToken, makerToken, takerFillAmounts],
        );
    }

    public getEth2DaiBuyQuotes(
        makerToken: string,
        takerToken: string,
        makerFillAmounts: BigNumber[],
    ): SourceQuoteOperation {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Eth2Dai,
            this._samplerContract.sampleBuysFromEth2Dai,
            [takerToken, makerToken, makerFillAmounts],
        );
    }

    public getCurveSellQuotes(
        curve: CurveInfo,
        fromTokenIdx: number,
        toTokenIdx: number,
        takerFillAmounts: BigNumber[],
    ): SourceQuoteOperation<CurveFillData> {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Curve,
            this._samplerContract.sampleSellsFromCurve,
            [
                {
                    poolAddress: curve.poolAddress,
                    sellQuoteFunctionSelector: curve.sellQuoteFunctionSelector,
                    buyQuoteFunctionSelector: curve.buyQuoteFunctionSelector,
                },
                new BigNumber(fromTokenIdx),
                new BigNumber(toTokenIdx),
                takerFillAmounts,
            ],
            {
                curve,
                fromTokenIdx,
                toTokenIdx,
            },
        );
    }

    public getCurveBuyQuotes(
        curve: CurveInfo,
        fromTokenIdx: number,
        toTokenIdx: number,
        makerFillAmounts: BigNumber[],
    ): SourceQuoteOperation<CurveFillData> {
        return new SamplerContractOperation(
            this._samplerContract,
            ERC20BridgeSource.Curve,
            this._samplerContract.sampleBuysFromCurve,
            [
                {
                    poolAddress: curve.poolAddress,
                    sellQuoteFunctionSelector: curve.sellQuoteFunctionSelector,
                    buyQuoteFunctionSelector: curve.buyQuoteFunctionSelector,
                },
                new BigNumber(fromTokenIdx),
                new BigNumber(toTokenIdx),
                makerFillAmounts,
            ],
            {
                curve,
                fromTokenIdx,
                toTokenIdx,
            },
        );
    }

    public async getBalancerSellQuotesAsync(
        makerToken: string,
        takerToken: string,
        takerFillAmounts: BigNumber[],
    ): Promise<Array<Array<DexSample<BalancerFillData>>>> {
        const pools = await this.balancerPoolsCache.getPoolsForPairAsync(takerToken, makerToken);
        return pools.map(pool =>
            takerFillAmounts.map(amount => ({
                source: ERC20BridgeSource.Balancer,
                output: computeBalancerSellQuote(pool, amount),
                input: amount,
                fillData: { poolAddress: pool.id },
            })),
        );
    }

    public async getBalancerBuyQuotesAsync(
        makerToken: string,
        takerToken: string,
        makerFillAmounts: BigNumber[],
    ): Promise<Array<Array<DexSample<BalancerFillData>>>> {
        const pools = await this.balancerPoolsCache.getPoolsForPairAsync(takerToken, makerToken);
        return pools.map(pool =>
            makerFillAmounts.map(amount => ({
                source: ERC20BridgeSource.Balancer,
                output: computeBalancerBuyQuote(pool, amount),
                input: amount,
                fillData: { poolAddress: pool.id },
            })),
        );
    }

    public async getMedianSellRateAsync(
        sources: ERC20BridgeSource[],
        makerToken: string,
        takerToken: string,
        takerFillAmount: BigNumber,
        wethAddress: string,
        liquidityProviderRegistryAddress?: string,
        multiBridgeAddress?: string,
    ): Promise<BatchedOperation<BigNumber>> {
        if (makerToken.toLowerCase() === takerToken.toLowerCase()) {
            return Promise.resolve(SamplerOperations._constant(new BigNumber(1)));
        }
        const getSellQuotes = await this.getSellQuotesAsync(
            sources,
            makerToken,
            takerToken,
            [takerFillAmount],
            wethAddress,
            liquidityProviderRegistryAddress,
            multiBridgeAddress,
        );
        return {
            encodeCall: () => {
                const subCalls = [getSellQuotes.encodeCall()];
                return this._samplerContract.batchCall(subCalls).getABIEncodedTransactionData();
            },
            handleCallResultsAsync: async callResults => {
                const rawSubCallResults = this._samplerContract.getABIDecodedReturnData<string[]>(
                    'batchCall',
                    callResults,
                );
                const samples = await getSellQuotes.handleCallResultsAsync(rawSubCallResults[0]);
                if (samples.length === 0) {
                    return new BigNumber(0);
                }
                const flatSortedSamples = samples
                    .reduce((acc, v) => acc.concat(...v))
                    .filter(v => !v.output.isZero())
                    .sort((a, b) => a.output.comparedTo(b.output));
                if (flatSortedSamples.length === 0) {
                    return new BigNumber(0);
                }
                const medianSample = flatSortedSamples[Math.floor(flatSortedSamples.length / 2)];
                return medianSample.output.div(medianSample.input);
            },
        };
    }

    public async getSellQuotesAsync(
        sources: ERC20BridgeSource[],
        makerToken: string,
        takerToken: string,
        takerFillAmounts: BigNumber[],
        wethAddress: string,
        liquidityProviderRegistryAddress?: string,
        multiBridgeAddress?: string,
    ): Promise<BatchedOperation<DexSample[][]>> {
        const subOps = _.flatten(
            await Promise.all(
                sources.map(
                    async (source): Promise<SourceQuoteOperation | SourceQuoteOperation[]> => {
                        switch (source) {
                            case ERC20BridgeSource.Eth2Dai:
                                return this.getEth2DaiSellQuotes(makerToken, takerToken, takerFillAmounts);
                            case ERC20BridgeSource.Uniswap:
                                return this.getUniswapSellQuotes(makerToken, takerToken, takerFillAmounts);
                            case ERC20BridgeSource.UniswapV2:
                                const ops = [this.getUniswapV2SellQuotes([takerToken, makerToken], takerFillAmounts)];
                                if (takerToken !== wethAddress && makerToken !== wethAddress) {
                                    ops.push(
                                        this.getUniswapV2SellQuotes(
                                            [takerToken, wethAddress, makerToken],
                                            takerFillAmounts,
                                        ),
                                    );
                                }
                                return ops;
                            case ERC20BridgeSource.Kyber:
                                return this.getKyberSellQuotes(makerToken, takerToken, takerFillAmounts);
                            case ERC20BridgeSource.Curve:
                                return getCurveInfosForPair(takerToken, makerToken).map(curve =>
                                    this.getCurveSellQuotes(
                                        curve,
                                        curve.tokens.indexOf(takerToken),
                                        curve.tokens.indexOf(makerToken),
                                        takerFillAmounts,
                                    ),
                                );
                            case ERC20BridgeSource.LiquidityProvider:
                                if (liquidityProviderRegistryAddress === undefined) {
                                    throw new Error(
                                        'Cannot sample liquidity from a LiquidityProvider liquidity pool, if a registry is not provided.',
                                    );
                                }
                                return this.getLiquidityProviderSellQuotes(
                                    liquidityProviderRegistryAddress,
                                    makerToken,
                                    takerToken,
                                    takerFillAmounts,
                                );
                            case ERC20BridgeSource.MultiBridge:
                                if (multiBridgeAddress === undefined) {
                                    throw new Error(
                                        'Cannot sample liquidity from MultiBridge if an address is not provided.',
                                    );
                                }
                                const intermediateToken = getMultiBridgeIntermediateToken(takerToken, makerToken);
                                return this.getMultiBridgeSellQuotes(
                                    multiBridgeAddress,
                                    makerToken,
                                    intermediateToken,
                                    takerToken,
                                    takerFillAmounts,
                                );
                            default:
                                throw new Error(`Unsupported sell sample source: ${source}`);
                        }
                    },
                ),
            ),
        );
        return {
            encodeCall: () => {
                const subCalls = subOps.map(op => op.encodeCall());
                return this._samplerContract.batchCall(subCalls).getABIEncodedTransactionData();
            },
            handleCallResultsAsync: async callResults => {
                const rawSubCallResults = this._samplerContract.getABIDecodedReturnData<string[]>(
                    'batchCall',
                    callResults,
                );
                const samples = await Promise.all(
                    subOps.map(async (op, i) => op.handleCallResultsAsync(rawSubCallResults[i])),
                );
                return subOps.map((op, i) => {
                    return samples[i].map((output, j) => ({
                        source: op.source,
                        output,
                        input: takerFillAmounts[j],
                        fillData: op.fillData,
                    }));
                });
            },
        };
    }

    public async getBuyQuotesAsync(
        sources: ERC20BridgeSource[],
        makerToken: string,
        takerToken: string,
        makerFillAmounts: BigNumber[],
        wethAddress: string,
        liquidityProviderRegistryAddress?: string,
    ): Promise<BatchedOperation<DexSample[][]>> {
        const subOps = _.flatten(
            await Promise.all(
                sources.map(
                    async (source): Promise<SourceQuoteOperation | SourceQuoteOperation[]> => {
                        switch (source) {
                            case ERC20BridgeSource.Eth2Dai:
                                return this.getEth2DaiBuyQuotes(makerToken, takerToken, makerFillAmounts);
                            case ERC20BridgeSource.Uniswap:
                                return this.getUniswapBuyQuotes(makerToken, takerToken, makerFillAmounts);
                            case ERC20BridgeSource.UniswapV2:
                                const ops = [this.getUniswapV2BuyQuotes([takerToken, makerToken], makerFillAmounts)];
                                if (takerToken !== wethAddress && makerToken !== wethAddress) {
                                    ops.push(
                                        this.getUniswapV2BuyQuotes(
                                            [takerToken, wethAddress, makerToken],
                                            makerFillAmounts,
                                        ),
                                    );
                                }
                                return ops;
                            case ERC20BridgeSource.Kyber:
                                return this.getKyberBuyQuotes(makerToken, takerToken, makerFillAmounts);
                            case ERC20BridgeSource.Curve:
                                return getCurveInfosForPair(takerToken, makerToken).map(curve =>
                                    this.getCurveBuyQuotes(
                                        curve,
                                        curve.tokens.indexOf(takerToken),
                                        curve.tokens.indexOf(makerToken),
                                        makerFillAmounts,
                                    ),
                                );
                            case ERC20BridgeSource.LiquidityProvider:
                                if (liquidityProviderRegistryAddress === undefined) {
                                    throw new Error(
                                        'Cannot sample liquidity from a LiquidityProvider liquidity pool, if a registry is not provided.',
                                    );
                                }
                                return this.getLiquidityProviderBuyQuotes(
                                    liquidityProviderRegistryAddress,
                                    makerToken,
                                    takerToken,
                                    makerFillAmounts,
                                );
                            default:
                                throw new Error(`Unsupported buy sample source: ${source}`);
                        }
                    },
                ),
            ),
        );
        return {
            encodeCall: () => {
                const subCalls = subOps.map(op => op.encodeCall());
                return this._samplerContract.batchCall(subCalls).getABIEncodedTransactionData();
            },
            handleCallResultsAsync: async callResults => {
                const rawSubCallResults = this._samplerContract.getABIDecodedReturnData<string[]>(
                    'batchCall',
                    callResults,
                );
                const samples = await Promise.all(
                    subOps.map(async (op, i) => op.handleCallResultsAsync(rawSubCallResults[i])),
                );
                return subOps.map((op, i) => {
                    return samples[i].map((output, j) => ({
                        source: op.source,
                        output,
                        input: makerFillAmounts[j],
                        fillData: op.fillData,
                    }));
                });
            },
        };
    }
}
// tslint:disable max-file-line-count
