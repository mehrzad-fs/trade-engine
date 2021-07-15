
import { localize } from '@deriv/translations';
import { observeBalance } from './Balance';
import { observeOpenContract } from './OpenContract';
import { checkProposalReady, makeProposals, observeProposals } from './Proposal';
import { watchTicks } from './Ticks';
import { checkLimits, clearStatistics } from './Total';
import { constants, signal as rootReducer, start as startAction,tradeEngineStore } from './state';
import { doUntilDone, expectInitArg, createError, globalObserver } from '../utils';
import { $scope } from '../scope';

const watchBefore = store =>
    watchScope({
        store,
        stopScope: constants.DURING_PURCHASE,
        passScope: constants.BEFORE_PURCHASE,
        passFlag: 'proposalsReady',
    });

const watchDuring = store =>
    watchScope({
        store,
        stopScope: constants.STOP,
        passScope: constants.DURING_PURCHASE,
        passFlag: 'openContract',
    });

/* The watchScope function is called randomly and resets the prevTick
 * which leads to the same problem we try to solve. So prevTick is isolated
 */
let prevTick;

const watchScope = ({ store, stopScope, passScope, passFlag }) => {
    // in case watch is called after stop is fired
    if (store.getState().scope === stopScope) {
        return Promise.resolve(false);
    }
    return new Promise(resolve => {
        const unsubscribe = store.subscribe(() => {
            const newState = store.getState();

            if (newState.newTick === prevTick) return;
            prevTick = newState.newTick;

            if (newState.scope === passScope && newState[passFlag]) {
                unsubscribe();
                resolve(true);
            }

            if (newState.scope === stopScope) {
                unsubscribe();
                resolve(false);
            }
        });
    });
};

export const initTradeEngine = (...args) => {
    const [token, options] = expectInitArg(args);
    const { symbol } = options;

    $scope.initArgs = args;
    $scope.options = options;
    $scope.startPromise = loginAndGetBalance(token);

    watchTicks(symbol);
    globalObserver.register('statistics.clear', clearStatistics);
};

export const loop = () => {
    if ($scope.stopped || !$scope.interpreter.run()) {
        $scope.onFinish($scope.interpreter.pseudoToNative($scope.interpreter.value));
    }
};

export const loginAndGetBalance = token => {
    if ($scope.token === token) {
        return Promise.resolve();
    }

    doUntilDone(() => $scope.api.authorize(token)).catch(e => {
        $scope.observer.emit('Error', e);
    });
    return new Promise(resolve => {
        // Try to recover from a situation where API doesn't give us a correct response on
        // "proposal_open_contract" which would make the bot run forever. When there's a "sell"
        // event, wait a couple seconds for the API to give us the correct "proposal_open_contract"
        // response, if there's none after x seconds. Send an explicit request, which _should_
        // solve the issue. This is a backup!
        $scope.api.onMessage().subscribe(({ data }) => {
            if (data.msg_type === 'transaction' && data.transaction.action === 'sell') {
                $scope.transaction_recovery_timeout = setTimeout(() => {
                    const { contract } = $scope.data;
                    const is_same_contract = contract.contract_id === data.transaction.contract_id;
                    const is_open_contract = contract.status === 'open';
                    if (is_same_contract && is_open_contract) {
                        doUntilDone(() => {
                            $scope.api.send({ proposal_open_contract: 1, contract_id: contract.contract_id });
                        }, ['PriceMoved']);
                    }
                }, 1500);
            }
            if (data.msg_type === 'authorize') {
                $scope.accountInfo = data;
                $scope.token = token;

                // Only subscribe to balance in browser, not for tests.
                if (document) {
                    doUntilDone(() => $scope.api.send({ balance: 1, subscribe: 1 })).then(r => {
                        $scope.balance = Number(r.balance.balance);
                        resolve();
                    });
                } else {
                    resolve();
                }
                doUntilDone(() => $scope.api.send({ transaction: 1, subscribe: 1 }));
            }
        });
    });
};

export const observe = () => {
    observeOpenContract();
    observeBalance();
    observeProposals();
};

export const revert = state => {
    $scope.interpreter.restoreStateSnapshot(state);
    $scope.interpreter.paused_ = false; // eslint-disable-line no-underscore-dangle
    loop();
};

export const start = tradeOptions => {
    if (!$scope.options) {
        throw createError('NotInitialized', localize('Bot.init is not called'));
    }

    globalObserver.emit('bot.running');

    $scope.tradeOptions = tradeOptions;

    $scope.store.dispatch(startAction());
    checkLimits(tradeOptions);
    makeProposals({ ...$scope.options, ...tradeOptions });
    checkProposalReady();
};

export const tradeEngine = () => {
    observe();
    $scope.data = {
        contract: {},
        proposals: [],
        forget_proposal_ids: [],
    };
    $scope.store = tradeEngineStore();
    $scope.stopped = false;
    $scope.observer.register('REVERT', watchName =>
        revert(watchName === 'before' ? $scope.beforeState : $scope.duringState)
    );
};

export const watch = watchName => {
    if (watchName === 'before') {
        return watchBefore($scope.store);
    }
    return watchDuring($scope.store);
};
