import { cloneThorough } from '@deriv/shared';
import JSInterpreter from 'js-interpreter';
import { observer as globalObserver } from './observer';
import { unrecoverable_errors } from './messages';
import { $scope } from '../scope';
import { getInterface, terminateSession, getTicksInterface } from '../Interface';
import { start, revert, loop, tradeEngine } from '../trade';

JSInterpreter.prototype.takeStateSnapshot = function () {
    const newStateStack = cloneThorough(this.stateStack, undefined, undefined, undefined, true);
    return newStateStack;
};

JSInterpreter.prototype.restoreStateSnapshot = function (snapshot) {
    this.stateStack = cloneThorough(snapshot, undefined, undefined, undefined, true);
    this.global = this.stateStack[0].scope.object || this.stateStack[0].scope;
    this.initFunc_(this, this.global);
};

const botInitialized = () => $scope.options;

const botStarted = () => botInitialized() && $scope.tradeOptions;

const shouldRestartOnError = (errorName = '') =>
    !unrecoverable_errors.includes(errorName) && botInitialized() && $scope.options.shouldRestartOnError;

const shouldStopOnError = (errorName = '') => {
    const stopErrors = ['SellNotAvailableCustom', 'ContractCreationFailure'];
    if (stopErrors.includes(errorName) && botInitialized()) {
        return true;
    }
    return false;
};

const timeMachineEnabled = () => botInitialized() && $scope.options.timeMachineEnabled;

export const createAsync = (interpreter, func) => {
    const asyncFunc = (...args) => {
        const callback = args.pop();

        // Workaround for unknown number of args
        const reversed_args = args.slice().reverse();
        const first_defined_arg_idx = reversed_args.findIndex(arg => arg !== undefined);

        // Remove extra undefined args from end of the args
        const function_args = first_defined_arg_idx < 0 ? [] : reversed_args.slice(first_defined_arg_idx).reverse();
        // End of workaround

        func(...function_args.map(arg => interpreter.pseudoToNative(arg)))
            .then(rv => {
                callback(interpreter.nativeToPseudo(rv));
                loop();
            })
            .catch(e => {
                // e.error for errors get from API, e for code errors
                $scope.observer.emit('Error', e.error || e);
            });
    };

    // TODO: This is a workaround, create issue on original repo, once fixed
    // remove this. We don't know how many args are going to be passed, so we
    // assume a max of 100.
    const MAX_ACCEPTABLE_FUNC_ARGS = 100;
    Object.defineProperty(asyncFunc, 'length', { value: MAX_ACCEPTABLE_FUNC_ARGS + 1 });
    return interpreter.createAsyncFunction(asyncFunc);
};

export const run = code => {
    const initFunc = (interpreter, scope) => {
        const bot_interface = getInterface('Bot');
        const ticks_interface = getTicksInterface();
        const { alert, prompt, sleep, console: custom_console } = getInterface();
        interpreter.setProperty(scope, 'console', interpreter.nativeToPseudo(custom_console));
        interpreter.setProperty(scope, 'alert', interpreter.nativeToPseudo(alert));
        interpreter.setProperty(scope, 'prompt', interpreter.nativeToPseudo(prompt));
        interpreter.setProperty(
            scope,
            'getPurchaseReference',
            interpreter.nativeToPseudo(bot_interface.getPurchaseReference)
        );

        const pseudo_bot_interface = interpreter.nativeToPseudo(bot_interface);

        Object.entries(ticks_interface).forEach(([name, f]) =>
            interpreter.setProperty(pseudo_bot_interface, name, createAsync(interpreter, f))
        );

        interpreter.setProperty(
            pseudo_bot_interface,
            'start',
            interpreter.nativeToPseudo((...args) => {
                if (shouldRestartOnError()) {
                    $scope.startState = interpreter.takeStateSnapshot();
                }
                start(...args);
            })
        );

        interpreter.setProperty(pseudo_bot_interface, 'purchase', createAsync(interpreter, bot_interface.purchase));
        interpreter.setProperty(
            pseudo_bot_interface,
            'sellAtMarket',
            createAsync(interpreter, bot_interface.sellAtMarket)
        );
        interpreter.setProperty(scope, 'Bot', pseudo_bot_interface);
        interpreter.setProperty(
            scope,
            'watch',
            createAsync(interpreter, watchName => {
                const { watch } = getInterface();

                if (timeMachineEnabled()) {
                    const snapshot = $scope.interpreter.takeStateSnapshot();
                    if (watchName === 'before') {
                        $scope.beforeState = snapshot;
                    } else {
                        $scope.duringState = snapshot;
                    }
                }

                return watch(watchName);
            })
        );

        interpreter.setProperty(scope, 'sleep', createAsync(interpreter, sleep));
    };

    return new Promise((resolve, reject) => {
        const onError = e => {
            if ($scope.stopped) {
                return;
            }
            // DBot handles 'InvalidToken' internally
            if (e.code === 'InvalidToken') {
                globalObserver.emit('client.invalid_token');
                return;
            }
            if (shouldStopOnError(e?.code)) {
                globalObserver.emit('ui.log.error', e.message);
                globalObserver.emit('bot.click_stop');
                return;
            }

            $scope.is_error_triggered = true;
            if (!shouldRestartOnError(e.code) || !botStarted()) {
                reject(e);
                return;
            }

            globalObserver.emit('Error', e);
            const { initArgs, tradeOptions } = $scope;
            terminateSession();
            tradeEngine();
            $scope.observer.register('Error', onError);
            $scope.init(...initArgs);
            start(tradeOptions);
            revert($scope.startState);
        };

        $scope.observer.register('Error', onError);

        $scope.interpreter = new JSInterpreter(code, initFunc);
        $scope.onFinish = resolve;

        loop();
    });
};
