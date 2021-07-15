import {
    getTicks,
    getLastTick,
    getLastDigit,
    getLastDigitList,
    checkDirection,
    getOhlc,
    getOhlcFromEnd,
} from '../trade';

export const getTicksInterface = () => {
    return {
        getLastTick: (...args) => getLastTick(...args),
        getLastDigit: (...args) => getLastDigit(...args),
        getTicks: (...args) => getTicks(...args),
        checkDirection: (...args) => checkDirection(...args),
        getOhlcFromEnd: (...args) => getOhlcFromEnd(...args),
        getOhlc: (...args) => getOhlc(...args),
        getLastDigitList: (...args) => getLastDigitList(...args),
    };
};
