import { expectCandle, expectCandles } from '../utils';

export const getCandleInterface = () => {
    return {
        isCandleBlack: candle => expectCandle(candle) && candle.close < candle.open,
        candleValues: (ohlc, field) => expectCandles(ohlc).map(o => o[field]),
        candleField: (candle, field) => expectCandle(candle)[field],
    };
};
