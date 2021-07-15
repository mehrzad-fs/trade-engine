import { getToolsInterface } from './ToolsInterface';
import {
    getPurchaseReference,
    getSellPrice,
    isSellAtMarketAvailable,
    initTradeEngine,
    purchase,
    sellAtMarket,
    start,
    watch,
} from '../trade';
import { createDetails, globalObserver } from '../utils';
import { $scope } from '../scope';

/**
 * Bot - Bot Module
 * @namespace Bot
 */

export const sleep = (arg = 1) => {
    return new Promise(
        r =>
            setTimeout(() => {
                r();
                setTimeout(() => $scope.observer.emit('CONTINUE'), 0);
            }, arg * 1000),
        () => {}
    );
};

export const getProposal = contract_type => {
    return $scope.data.proposals.find(
        proposal => proposal.contract_type === contract_type && proposal.purchase_reference === getPurchaseReference()
    );
};

export const getInterface = (name = 'Global') => {
    if (name === 'Bot') {
        return {
            ...getBotInterface(),
            ...getToolsInterface(),
        };
    }
    return {
        watch: (...args) => watch(...args),
        sleep: (...args) => sleep(...args),
        alert: (...args) => alert(...args), // eslint-disable-line no-alert
        prompt: (...args) => prompt(...args), // eslint-disable-line no-alert
        console: {
            log(...args) {
                // eslint-disable-next-line no-console
                console.log(new Date().toLocaleTimeString(), ...args);
            },
        },
    };
};

export const getBotInterface = () => {
    const getDetail = i => createDetails($scope.data.contract)[i];
    return {
        init: (...args) => initTradeEngine(...args),
        start: (...args) => start(...args),
        stop: (...args) => stop(...args),
        purchase: contract_type => purchase(contract_type),
        getAskPrice: contract_type => Number(getProposal(contract_type).ask_price),
        getPayout: contract_type => Number(getProposal(contract_type).payout),
        getPurchaseReference: () => getPurchaseReference(),
        isSellAvailable: () => isSellAtMarketAvailable(),
        sellAtMarket: () => sellAtMarket(),
        getSellPrice: () => getSellPrice(),
        isResult: result => getDetail(10) === result,
        isTradeAgain: result => globalObserver.emit('bot.trade_again', result),
        readDetails: i => getDetail(i - 1),
    };
};

export const terminateSession = () => {
    const { connection } = $scope.api;
    if (connection.readyState === 0) {
        connection.addEventListener('open', () => connection.close());
    } else if (connection.readyState === 1) {
        connection.close();
    }

    $scope.stopped = true;
    $scope.is_error_triggered = false;

    globalObserver.emit('bot.stop');
};

export const stop = () => {
    const global_timeouts = globalObserver.getState('global_timeouts') ?? [];
    const is_timeouts_cancellable = Object.keys(global_timeouts).every(
        timeout => global_timeouts[timeout].is_cancellable
    );

    if (!$scope.contractId && is_timeouts_cancellable) {
        // When user is rate limited, allow them to stop the bot immediately
        // granted there is no active contract.
        global_timeouts.forEach(timeout => clearTimeout(global_timeouts[timeout]));
        terminateSession();
    } else if ($scope.isSold === false && !$scope.is_error_triggered) {
        globalObserver.register('contract.status', contractStatus => {
            if (contractStatus.id === 'contract.sold') {
                terminateSession();
            }
        });
    } else {
        terminateSession();
    }
};
