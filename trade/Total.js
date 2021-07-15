import { getRoundedNumber } from '@deriv/shared';
import { localize } from '@deriv/translations';
import { info, log, createError, log_types } from '../utils';
import { $scope } from '../scope';

const skeleton = {
    totalProfit: 0,
    totalWins: 0,
    totalLosses: 0,
    totalStake: 0,
    totalPayout: 0,
    totalRuns: 0,
};

const globalStat = {};

const getAccountStat = () => {
    const { loginid: accountID } = $scope.accountInfo;

    if (!(accountID in globalStat)) {
        globalStat[accountID] = { ...skeleton };
    }

    return globalStat[accountID];
};

export const checkLimits = tradeOption => {
    if (!tradeOption.limitations) {
        return;
    }

    const {
        limitations: { maxLoss, maxTrades },
    } = tradeOption;

    if (maxLoss && maxTrades) {
        if ($scope.sessionRuns >= maxTrades) {
            throw createError('CustomLimitsReached', localize('Maximum number of trades reached'));
        }
        if ($scope.sessionProfit <= -maxLoss) {
            throw createError('CustomLimitsReached', localize('Maximum loss amount reached'));
        }
    }
};

export const clearStatistics = () => {
    $scope.sessionRuns = 0;
    $scope.sessionProfit = 0;
    if (!$scope.accountInfo) return;
    const { loginid: accountID } = $scope.accountInfo;
    globalStat[accountID] = { ...skeleton };
};

export const getTotalProfit = (toString, currency) => {
    const accountStat = getAccountStat();

    return toString && accountStat.totalProfit !== 0
        ? getRoundedNumber(+accountStat.totalProfit, currency)
        : +accountStat.totalProfit;
};

export const getTotalRuns = () => {
    const accountStat = getAccountStat();
    return accountStat.totalRuns;
};

export const updateAndReturnTotalRuns = () => {
    $scope.sessionRuns++;
    const accountStat = getAccountStat();

    return ++accountStat.totalRuns;
};

export const updateTotals = contract => {
    const { sell_price: sellPrice, buy_price: buyPrice, currency } = contract;

    const profit = getRoundedNumber(Number(sellPrice) - Number(buyPrice), currency);

    const win = profit > 0;

    const accountStat = getAccountStat();

    accountStat.totalWins += win ? 1 : 0;

    accountStat.totalLosses += !win ? 1 : 0;

    $scope.sessionProfit = getRoundedNumber(Number($scope.sessionProfit) + Number(profit), currency);

    accountStat.totalProfit = getRoundedNumber(Number(accountStat.totalProfit) + Number(profit), currency);

    accountStat.totalStake = getRoundedNumber(Number(accountStat.totalStake) + Number(buyPrice), currency);

    accountStat.totalPayout = getRoundedNumber(Number(accountStat.totalPayout) + Number(sellPrice), currency);

    info({
        profit,
        contract,
        accountID: $scope.accountInfo.loginid,
        totalProfit: accountStat.totalProfit,
        totalWins: accountStat.totalWins,
        totalLosses: accountStat.totalLosses,
        totalStake: accountStat.totalStake,
        totalPayout: accountStat.totalPayout,
    });

    log(win ? log_types.PROFIT : log_types.LOST, { currency, profit });
};
