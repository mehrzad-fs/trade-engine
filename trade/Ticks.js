import { getLast } from 'binary-utils';
import { localize } from '@deriv/translations';
import { constants } from './state';
import { checkProposalReady } from './Proposal';
import { getDirection, expectPositiveInteger, globalObserver } from '../utils';
import { $scope } from '../scope';

let tickListenerKey;

export const checkDirection = dir => {
    return new Promise(resolve =>
        $scope.ticksService.request({ symbol: $scope.symbol }).then(ticks => resolve(getDirection(ticks) === dir))
    );
};

export const getLastDigit = () => {
    return new Promise(resolve => getLastTick().then(tick => resolve(getLastDigit(tick, getPipSize()))));
};

export const getLastDigitList = () => {
    return new Promise(resolve =>
        getTicks().then(ticks => resolve(ticks.map(tick => getLastDigit(tick, getPipSize()))))
    );
};

export const getLastTick = (raw, toString = false) => {
    return new Promise(resolve =>
        $scope.ticksService
            .request({ symbol: $scope.symbol })
            .then(ticks => {
                let lastTick = raw ? getLast(ticks) : getLast(ticks).quote;

                if (toString && !raw) {
                    lastTick = lastTick.toFixed(getPipSize());
                }
                resolve(lastTick);
            })
            .catch(e => {
                if (e.code === 'MarketIsClosed') {
                    globalObserver.emit('Error', e);
                    resolve(e.code);
                }
            })
    );
};

export const getOhlc = args => {
    const { granularity = $scope.options.candleInterval || 60, field } = args || {};

    return new Promise(resolve =>
        $scope.ticksService
            .request({ symbol: $scope.symbol, granularity })
            .then(ohlc => resolve(field ? ohlc.map(o => o[field]) : ohlc))
    );
};

export const getOhlcFromEnd = args => {
    const { index: i = 1 } = args || {};

    const index = expectPositiveInteger(Number(i), localize('Index must be a positive integer'));

    return new Promise(resolve => getOhlc(args).then(ohlc => resolve(ohlc.slice(-index)[0])));
};

export const getPipSize = () => {
    return $scope.ticksService.pipSizes[$scope.symbol];
};

export const getTicks = (toString = false) => {
    return new Promise(resolve => {
        $scope.ticksService.request({ symbol: $scope.symbol }).then(ticks => {
            const pipSize = getPipSize();
            const ticksList = ticks.map(o => {
                if (toString) {
                    return o.quote.toFixed(pipSize);
                }
                return o.quote;
            });

            resolve(ticksList);
        });
    });
};

export const watchTicks = symbol => {
    if (symbol && $scope.symbol !== symbol) {
        const { ticksService } = $scope;

        ticksService.stopMonitor({
            symbol,
            key: tickListenerKey,
        });

        const callback = ticks => {
            checkProposalReady();
            const lastTick = ticks.slice(-1)[0];
            const { epoch } = lastTick;
            $scope.store.dispatch({ type: constants.NEW_TICK, payload: epoch });
        };

        const key = ticksService.monitor({ symbol, callback });

        $scope.symbol = symbol;

        tickListenerKey = key;
    }
};
