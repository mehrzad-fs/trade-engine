import { constants, purchaseSuccessful } from './state';
import { renewProposalsOnPurchase, selectProposal, clearProposals } from './Proposal';
import { updateAndReturnTotalRuns } from './Total';
import { subscribeToOpenContract } from './OpenContract';
import { contractStatus, info, log, recoverFromError, doUntilDone, log_types } from '../utils';
import { $scope } from '../scope';

let delayIndex = 0;

export const purchase = contract_type => {
    const { BEFORE_PURCHASE } = constants;
    // Prevent calling purchase twice
    if ($scope.store.getState().scope !== BEFORE_PURCHASE) {
        return Promise.resolve();
    }

    const { id, askPrice } = selectProposal(contract_type);

    const onSuccess = response => {
        // Don't unnecessarily send a forget request for a purchased contract.
        $scope.data.proposals = $scope.data.proposals.filter(p => p.id !== response.echo_req.buy);
        const { buy } = response;

        contractStatus({
            id: 'contract.purchase_received',
            data: buy.transaction_id,
            buy,
        });

        subscribeToOpenContract(buy.contract_id);
        $scope.store.dispatch(purchaseSuccessful());
        renewProposalsOnPurchase();
        delayIndex = 0;
        log(log_types.PURCHASE, { longcode: buy.longcode, transaction_id: buy.transaction_id });
        info({
            accountID: $scope.accountInfo.loginid,
            totalRuns: updateAndReturnTotalRuns(),
            transaction_ids: { buy: buy.transaction_id },
            contract_type,
            buy_price: buy.buy_price,
        });
    };
    const action = () => $scope.api.send({ buy: id, price: askPrice });
    $scope.isSold = false;
    contractStatus({
        id: 'contract.purchase_sent',
        data: askPrice,
    });

    if (!$scope.options.timeMachineEnabled) {
        return doUntilDone(action).then(onSuccess);
    }
    return recoverFromError(
        action,
        (errorCode, makeDelay) => {
            // if disconnected no need to resubscription (handled by live-api)
            if (errorCode !== 'DisconnectError') {
                renewProposalsOnPurchase();
            } else {
                clearProposals();
            }

            const unsubscribe = $scope.store.subscribe(() => {
                const { scope, proposalsReady } = $scope.store.getState();
                if (scope === BEFORE_PURCHASE && proposalsReady) {
                    makeDelay().then(() => $scope.observer.emit('REVERT', 'before'));
                    unsubscribe();
                }
            });
        },
        ['PriceMoved', 'InvalidContractProposal'],
        delayIndex++
    ).then(onSuccess);
};
