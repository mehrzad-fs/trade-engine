import { getRoundedNumber } from '@deriv/shared';
import { sell, openContractReceived } from './state';
import { updateTotals } from './Total';
import { contractStatus, contract as broadcastContract, doUntilDone } from '../utils';
import { $scope } from '../scope';

export const expectedContractId = contractId => {
    return $scope.contractId && contractId === $scope.contractId;
};

export const getSellPrice = () => {
    const { bid_price: bidPrice, buy_price: buyPrice, currency } = $scope.data.contract;
    return getRoundedNumber(Number(bidPrice) - Number(buyPrice), currency);
};

export const observeOpenContract = () => {
    $scope.api.onMessage().subscribe(({ data }) => {
        if (data.msg_type === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;

            if (!contract && !$scope.expectedContractId(contract?.contract_id)) {
                return;
            }

            setContractFlags(contract);

            $scope.data.contract = contract;

            broadcastContract({ accountID: $scope.accountInfo.loginid, ...contract });

            if ($scope.isSold) {
                $scope.contractId = '';
                clearTimeout($scope.transaction_recovery_timeout);
                updateTotals(contract);
                contractStatus({
                    id: 'contract.sold',
                    data: contract.transaction_ids.sell,
                    contract,
                });

                if ($scope.afterPromise) {
                    $scope.afterPromise();
                }

                $scope.store.dispatch(sell());
            } else {
                $scope.store.dispatch(openContractReceived());
            }
        }
    });
};

export const setContractFlags = contract => {
    const { is_expired, is_valid_to_sell, is_sold, entry_tick } = contract;

    $scope.isSold = Boolean(is_sold);
    $scope.isSellAvailable = !$scope.isSold && Boolean(is_valid_to_sell);
    $scope.isExpired = Boolean(is_expired);
    $scope.hasEntryTick = Boolean(entry_tick);
};

export const subscribeToOpenContract = (contract_id = $scope.contractId) => {
    $scope.contractId = contract_id;
    doUntilDone(() => $scope.api.send({ proposal_open_contract: 1, contract_id, subscribe: 1 }))
        .then(data => {
            $scope.openContractId = data.proposal_open_contract.id;
        })
        .catch(error => {
            if (error.error.code !== 'AlreadySubscribed') {
                doUntilDone(() => $scope.api.send({ proposal_open_contract: 1, contract_id, subscribe: 1 })).then(
                    response => ($scope.openContractId = response.proposal_open_contract.id)
                );
            }
        });
};

export const waitForAfter = () => {
    return new Promise(resolve => {
        $scope.afterPromise = resolve;
    });
};
