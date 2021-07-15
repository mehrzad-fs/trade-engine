// Balance
export { getBalance, observeBalance } from './Balance';

// General
export { initTradeEngine, loginAndGetBalance, loop, observe, revert, start, tradeEngine, watch } from './General';

// OpenContract
export {
    expectedContractId,
    getSellPrice,
    observeOpenContract,
    setContractFlags,
    subscribeToOpenContract,
    waitForAfter,
} from './OpenContract';

// Proposal
export {
    checkProposalReady,
    clearProposals,
    getPurchaseReference,
    isNewTradeOption,
    makeProposals,
    observeProposals,
    regeneratePurchaseReference,
    renewProposalsOnPurchase,
    requestProposals,
    selectProposal,
    unsubscribeProposals,
} from './Proposal';

// Purchase
export { purchase } from './Purchase';

// Sell
export { isSellAtMarketAvailable, sellAtMarket } from './Sell';

// Ticks
export {
    checkDirection,
    getLastDigit,
    getLastDigitList,
    getLastTick,
    getOhlc,
    getOhlcFromEnd,
    getPipSize,
    getTicks,
    watchTicks,
} from './Ticks';

// Total
export {
    checkLimits,
    clearStatistics,
    getTotalProfit,
    getTotalRuns,
    updateAndReturnTotalRuns,
    updateTotals,
} from './Total';
