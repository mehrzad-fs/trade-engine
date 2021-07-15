import { getFormattedText } from '@deriv/shared';
import { info } from '../utils';
import { $scope } from '../scope';

let balance_string = '';

export const getBalance = type => {
    const { scope } = $scope.store.getState();
    const { client } = $scope;
    const balance = (client && client.balance) || 0;
    let value = balance;

    if (scope === 'BEFORE_PURCHASE') {
        // Deduct trade amount in this scope for correct (🤦) value in balance-block
        value = Number(balance) - $scope.tradeOptions.amount;
    }

    balance_string = getFormattedText(value, client.currency, false);
    return type === 'STR' ? balance_string : balance;
};

export const observeBalance = () => {
    $scope.api.onMessage().subscribe(({ data }) => {
        if (data.msg_type === 'balance') {
            const {
                balance: { balance: b, currency },
            } = data;

            balance_string = getFormattedText(b, currency);

            info({ accountID: $scope.accountInfo.loginid, balance: balance_string });
        }
    });
};
